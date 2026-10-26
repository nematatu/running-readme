"""Compile the sender without signing or running it, then verify its actual plist."""
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
compiler = os.environ.get('CHERRI_BIN') or shutil.which('cherri')
if not compiler:
    raise SystemExit('Install Cherri 2.3.0 or set CHERRI_BIN to its binary.')
source = root / 'shortcuts/upload-running-readme.cherri'
with tempfile.TemporaryDirectory(prefix='running-readme-cherri-') as directory:
    temporary = Path(directory)
    copied = temporary / source.name
    shutil.copyfile(source, copied)
    subprocess.run([compiler, str(copied), '--skip-sign'], check=True)
    generated = temporary / 'Upload Running README_unsigned.shortcut'
    workflow = plistlib.loads(generated.read_bytes())
    actions = workflow['WFWorkflowActions']
    assert workflow['WFWorkflowInputContentItemClasses'] == ['WFStringContentItem']
    assert workflow['WFWorkflowNoInputBehavior']['Name'] == 'WFWorkflowNoInputBehaviorShowError'
    conditional_starts = [a['WFWorkflowActionParameters']['GroupingIdentifier'] for a in actions
                          if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.conditional'
                          and a['WFWorkflowActionParameters']['WFControlFlowMode'] == 0]
    assert len(conditional_starts) == len(set(conditional_starts)) == 3
    keychains = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'com.sindresorhus.Actions.KeychainGetIntent']
    assert len(keychains) == 1
    keychain = keychains[0]['WFWorkflowActionParameters']
    assert keychain['key'] == 'running-readme.ingest-token'
    texts = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.detect.text']
    assert len(texts) == 1
    text_uuid = texts[0]['WFWorkflowActionParameters']['UUID']
    requests = [a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.downloadurl']
    assert len(requests) == 1
    request = requests[0]['WFWorkflowActionParameters']
    assert request['WFURL'] == 'https://running-readme-api.amtt.workers.dev/v1/workouts'
    assert request['WFHTTPMethod'] == 'POST' and request['WFHTTPBodyType'] == 'JSON'

    def fields(value):
        return {item['WFKey']['Value']['string']: item['WFValue']['Value']
                for item in value['Value']['WFDictionaryFieldValueItems']}

    body = fields(request['WFJSONValues'])
    assert list(body) == ['workoutsText']
    assert list(body['workoutsText']['attachmentsByRange'].values())[0]['OutputUUID'] == text_uuid
    headers = fields(request['WFHTTPHeaders'])
    assert headers['Content-Type']['string'] == 'application/json'
    assert headers['Authorization']['string'] == 'Bearer \ufffc'
    assert list(headers['Authorization']['attachmentsByRange'].values())[0]['OutputUUID'] == keychain['UUID']
    def references(value):
        found = set()
        if isinstance(value, dict):
            if 'OutputUUID' in value:
                found.add(value['OutputUUID'])
            for child in value.values():
                found.update(references(child))
        elif isinstance(value, list):
            for child in value:
                found.update(references(child))
        return found

    values = [a['WFWorkflowActionParameters'] for a in actions
              if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.getvalueforkey']
    assert len(values) == 1 and values[0]['WFDictionaryKey'] == 'ok'
    numbers = [a['WFWorkflowActionParameters'] for a in actions
               if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.number']
    assert len(numbers) == 1
    assert references(numbers[0]['WFNumberActionNumber']) == {values[0]['UUID']}
    guards = [(index, a['WFWorkflowActionParameters']) for index, a in enumerate(actions)
              if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.conditional'
              and a['WFWorkflowActionParameters']['WFControlFlowMode'] == 0]
    for (index, guard), expected_uuid, expected_condition in zip(
            guards, [text_uuid, keychain['UUID'], numbers[0]['UUID']], [101, 101, 5]):
        assert references(guard['WFInput']) == {expected_uuid}
        assert guard['WFCondition'] == expected_condition
        end = next(end_index for end_index in range(index + 1, len(actions))
                   if actions[end_index]['WFWorkflowActionIdentifier'] == 'is.workflow.actions.conditional'
                   and actions[end_index]['WFWorkflowActionParameters']['WFControlFlowMode'] == 2
                   and actions[end_index]['WFWorkflowActionParameters']['GroupingIdentifier'] == guard['GroupingIdentifier'])
        assert any(a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.exit' for a in actions[index + 1:end])
        assert not any(a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.downloadurl' for a in actions[index + 1:end])
    assert guards[-1][1]['WFNumberValue'] == 1
    assert len([a for a in actions if a['WFWorkflowActionIdentifier'] == 'is.workflow.actions.downloadurl']) == 1
    output_text = generated.read_bytes()
    assert b'INGEST_TOKEN=' not in output_text
    destination = root / 'artifacts/cherri'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'upload-running-readme.plist').write_bytes(output_text)
print('Cherri compiled; input guards, distinct conditions, Keychain reference, JSON body and Bearer reference verified.')
print('This check did not sign, import, run, read Health/Keychain, or contact the API.')
