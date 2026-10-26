"""Compile Cherri and preserve canonical Actions property metadata without running it."""
import argparse
from copy import deepcopy
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
QUERY = 'com.sindresorhus.Actions.WorkoutAppEntity'
KEYCHAIN = 'com.sindresorhus.Actions.KeychainGetIntent'
PROPERTIES = {'workoutType', 'startDate', 'duration', 'totalDistance'}


def nodes(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child)


def parameters(workflow, identifier):
    return [action.get('WFWorkflowActionParameters', {}) for action in workflow['WFWorkflowActions']
            if action['WFWorkflowActionIdentifier'] == identifier]


def only(items):
    assert len(items) == 1, 'Expected exactly one matching action or property.'
    return items[0]


def canonical_data(reference):
    query = only(parameters(reference, QUERY))
    descriptor = query['AppIntentDescriptor']
    assert descriptor['BundleIdentifier'] == 'com.sindresorhus.Actions'
    assert descriptor['AppIntentIdentifier'] == 'WorkoutAppEntity'
    properties = {}
    for node in nodes(reference):
        if node.get('Type') != 'WFPropertyVariableAggrandizement' or node.get('PropertyName') not in PROPERTIES:
            continue
        name = node['PropertyName']
        info = node['PropertyUserInfo']
        assert info['WFLinkEntityContentPropertyUserInfoPropertyIdentifier'] == name
        assert isinstance(info['WFLinkEntityContentPropertyUserInfoEnumMetadata'], bytes)
        if name in properties:
            assert properties[name] == info, 'Conflicting property metadata in reference.'
        properties[name] = deepcopy(info)
    assert properties.keys() == PROPERTIES, 'Reference lacks a required Workout property.'
    table = only([node['WFConditions'] for node in nodes(reference)
                  if isinstance(node.get('WFConditions'), dict)
                  and any(row.get('WFLinkEnumeration') == 'running' for row in
                          node['WFConditions']['Value']['WFActionParameterFilterTemplates'])])
    running = only([row for row in table['Value']['WFActionParameterFilterTemplates']
                    if row.get('WFLinkEnumeration') == 'running' and row.get('WFCondition') == 4])
    return query, properties, table, running


def materialize(workflow, reference):
    source_query, properties, source_table, source_running = canonical_data(reference)
    query = only(parameters(workflow, QUERY))
    assert query['WFContentItemLimitEnabled'] is False
    query['AppIntentDescriptor'] = deepcopy(source_query['AppIntentDescriptor'])
    query['WFContentItemFilter'] = deepcopy(source_query['WFContentItemFilter'])
    assert query['WFContentItemFilter']['Value']['WFActionParameterFilterTemplates'] == []
    for node in nodes(workflow):
        if node.get('Type') == 'WFPropertyVariableAggrandizement':
            assert node['PropertyName'] in properties, 'Unknown Workout property in source.'
            assert node.get('PropertyUserInfo') in (None, 0)
            node['PropertyUserInfo'] = deepcopy(properties[node['PropertyName']])
    condition = only([item for item in parameters(workflow, 'is.workflow.actions.conditional')
                      if item.get('WFControlFlowMode') == 0
                      and any(node.get('PropertyName') == 'workoutType' for node in nodes(item.get('WFInput')))])
    assert condition['WFCondition'] == 4 and condition['WFConditionalActionString'] == 'Running'
    running = deepcopy(source_running)
    running['WFInput'] = deepcopy(condition['WFInput'])
    for node in nodes(running['WFInput']):
        if 'Aggrandizements' in node:
            node['Aggrandizements'] = [item for item in node['Aggrandizements']
                                      if item.get('Type') != 'WFCoercionVariableAggrandizement']
    for key in ['WFCondition', 'WFConditionalActionString', 'WFInput']:
        del condition[key]
    condition['WFConditions'] = deepcopy(source_table)
    condition['WFConditions']['Value']['WFActionParameterFilterTemplates'] = [running]
    keychain = only(parameters(workflow, KEYCHAIN))
    keychain['AppIntentDescriptor'] = deepcopy(source_query['AppIntentDescriptor'])
    keychain['AppIntentDescriptor']['AppIntentIdentifier'] = 'KeychainGetIntent'
    for key in ['WFWorkflowClientVersion', 'WFWorkflowMinimumClientVersion', 'WFWorkflowMinimumClientVersionString']:
        if key in reference:
            workflow[key] = deepcopy(reference[key])
    return workflow


def references(value):
    return {node['OutputUUID'] for node in nodes(value) if 'OutputUUID' in node}


def verify(workflow, reference):
    source_query, properties, _, _ = canonical_data(reference)
    actions = workflow['WFWorkflowActions']
    assert not parameters(workflow, 'is.workflow.actions.choosefromlist')
    assert not parameters(workflow, 'is.workflow.actions.appendnote')
    assert not workflow.get('WFWorkflowHasShortcutInputVariables', False)
    query = only(parameters(workflow, QUERY))
    assert query['WFContentItemLimitEnabled'] is False
    assert query['AppIntentDescriptor'] == source_query['AppIntentDescriptor']
    assert query['WFContentItemSortProperty'] == 'startDate'
    assert query['WFContentItemSortOrder'] == 'Latest First'
    repeats = parameters(workflow, 'is.workflow.actions.repeat.each')
    assert len(repeats) == 2 and repeats[0]['WFControlFlowMode'] == 0 and repeats[1]['WFControlFlowMode'] == 2
    assert references(repeats[0]['WFInput']) == {query['UUID']}
    workout = only([item for item in parameters(workflow, 'is.workflow.actions.setvariable')
                    if item['WFVariableName'] == 'workout'])
    assert workout['WFInput']['Value']['VariableName'] == 'Repeat Item'
    seen = set()
    for node in nodes(workflow):
        if node.get('Type') == 'WFPropertyVariableAggrandizement':
            name = node['PropertyName']
            assert node['PropertyUserInfo'] == properties[name]
            seen.add(name)
    assert seen == PROPERTIES
    starts = [item for item in parameters(workflow, 'is.workflow.actions.conditional') if item.get('WFControlFlowMode') == 0]
    assert len(starts) == 5 and len({item['GroupingIdentifier'] for item in starts}) == 5
    running = only([item for item in starts if 'WFConditions' in item])
    predicates = running['WFConditions']['Value']['WFActionParameterFilterTemplates']
    assert len(predicates) == 1 and predicates[0]['WFLinkEnumeration'] == 'running' and predicates[0]['WFCondition'] == 4
    assert any(node.get('VariableName') == 'workout' for node in nodes(predicates[0]['WFInput']))
    dates = parameters(workflow, 'is.workflow.actions.format.date')
    offset = only([item for item in dates if item.get('WFDateFormat') == 'XXX'])
    only([item for item in dates if item.get('WFDateFormat') == 'yyyy/MM/dd HH:mm:ss'])
    joined = only(parameters(workflow, 'is.workflow.actions.text.combine'))
    assert references(joined['text']) == {repeats[1]['UUID']}
    text = only(parameters(workflow, 'is.workflow.actions.text.trimwhitespace'))
    assert references(text['WFInput']) == {joined['UUID']}
    keychain = only(parameters(workflow, KEYCHAIN))
    assert keychain['key'] == 'running-readme.ingest-token'
    assert keychain['AppIntentDescriptor']['AppIntentIdentifier'] == 'KeychainGetIntent'
    request = only(parameters(workflow, 'is.workflow.actions.downloadurl'))
    assert request['WFURL'] == 'https://running-readme-api.amtt.workers.dev/v1/workouts'
    assert request['WFHTTPMethod'] == 'POST' and request['WFHTTPBodyType'] == 'JSON'

    def fields(value):
        return {item['WFKey']['Value']['string']: item['WFValue']['Value']
                for item in value['Value']['WFDictionaryFieldValueItems']}

    body = fields(request['WFJSONValues'])
    assert list(body) == ['workoutsText'] and references(body['workoutsText']) == {text['UUID']}
    headers = fields(request['WFHTTPHeaders'])
    assert headers['Content-Type']['string'] == 'application/json'
    assert headers['Authorization']['string'] == 'Bearer \ufffc'
    assert references(headers['Authorization']) == {keychain['UUID']}
    value = only(parameters(workflow, 'is.workflow.actions.getvalueforkey'))
    assert value['WFDictionaryKey'] == 'ok'
    number = only(parameters(workflow, 'is.workflow.actions.number'))
    assert references(number['WFNumberActionNumber']) == {value['UUID']}
    guards = [item for item in starts if 'WFConditions' not in item]
    for guard, expected_uuid, expected_condition in zip(
            guards, [offset['UUID'], text['UUID'], keychain['UUID'], number['UUID']], [5, 101, 101, 5]):
        assert references(guard['WFInput']) == {expected_uuid} and guard['WFCondition'] == expected_condition
        index = next(i for i, action in enumerate(actions) if action.get('WFWorkflowActionParameters') is guard)
        end = next(i for i in range(index + 1, len(actions))
                   if actions[i].get('WFWorkflowActionParameters', {}).get('GroupingIdentifier') == guard['GroupingIdentifier']
                   and actions[i]['WFWorkflowActionParameters'].get('WFControlFlowMode') == 2)
        assert any(action['WFWorkflowActionIdentifier'] == 'is.workflow.actions.exit' for action in actions[index + 1:end])
        assert not any(action['WFWorkflowActionIdentifier'] == 'is.workflow.actions.downloadurl' for action in actions[index + 1:end])
    assert guards[0]['WFConditionalActionString'] == '+09:00'
    assert guards[-1]['WFNumberValue'] == 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path, help='Unsigned plist exported from the working iOS shortcut.')
    args = parser.parse_args()
    reference = plistlib.loads(args.reference.read_bytes())
    compiler = os.environ.get('CHERRI_BIN') or shutil.which('cherri')
    if not compiler:
        raise SystemExit('Install Cherri 2.3.0 or set CHERRI_BIN to its binary.')
    source = ROOT / 'shortcuts/upload-running-readme.cherri'
    with tempfile.TemporaryDirectory(prefix='running-readme-cherri-') as directory:
        temporary = Path(directory)
        copied = temporary / source.name
        shutil.copyfile(source, copied)
        subprocess.run([compiler, str(copied), '--skip-sign'], check=True)
        generated = temporary / 'Upload Running README_unsigned.shortcut'
        workflow = materialize(plistlib.loads(generated.read_bytes()), reference)
        verify(workflow, reference)
        destination = ROOT / 'artifacts/cherri'
        destination.mkdir(parents=True, exist_ok=True)
        destination.chmod(0o700)
        artifact = destination / 'Upload Running README_unsigned.shortcut'
        artifact.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML))
        artifact.chmod(0o600)
    print('Full Cherri flow compiled and canonical Actions metadata preserved; graph checks passed.')
    print('Health/Keychain reads, API submission, signing, and iPhone execution were not performed.')


if __name__ == '__main__':
    main()
