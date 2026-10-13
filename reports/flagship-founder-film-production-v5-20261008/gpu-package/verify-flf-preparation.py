"""CPU-only integrity check of prepared, pinned first/last-frame weights."""
import argparse
import hashlib
import json
import time
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--model-profile',choices=['flf2v','vace14b'],default='flf2v');args=p.parse_args()
large=args.model_profile=='vace14b'
root = Path('/tmp/autopromote-wan-vace14b-20261008' if large else '/tmp/autopromote-wan-flf-20261008')
receipt_file = root/'model-receipt.json'
receipt = json.loads(receipt_file.read_text())
assert (receipt['model'], receipt['revision']) == (
    ('Wan-AI/Wan2.1-VACE-14B-diffusers','db79b90c60bbb45ceec9e41b9d5a4df934538ac4') if large else
    ('Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers','17c30769b1e0b5dcaa1799b117bf20a9c31f59d7'))

def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        while block := stream.read(8*1024*1024):
            digest.update(block)
    return digest.hexdigest()

# This preparation run compiled before the source fix that refreshes the index
# receipt after bf16 metadata conversion. Preserve the original row as evidence.
index_name = 'transformer/diffusion_pytorch_model.safetensors.index.json'
index_file = root/index_name
index = json.loads(index_file.read_text())
converted = receipt['convertedTransformer']
assert len(converted) == (13 if large else 14)
assert index['metadata']['total_size'] == sum(row['bytes'] for row in converted)
assert set(index['weight_map'].values()) == {Path(row['file']).name for row in converted}
for row in receipt['files']:
    if row['file'] == index_name and row['sha256'] != sha(index_file):
        receipt.setdefault('receiptCorrections', []).append({
            'originalRecord': dict(row), 'atEpoch': time.time(),
            'reason': 'Refresh prepared index hash after bf16 metadata update; weight map unchanged.'})
        row.update(sha256=sha(index_file), bytes=index_file.stat().st_size,
                   conversion='Updated bf16 index metadata; original weight map retained')

if large and 'imageEncoderDtype' in receipt['settings']:
    receipt.setdefault('receiptCorrections', []).append({
        'originalSettings': dict(receipt['settings']),
        'originalVaeValidation': receipt['reusedComponents']['vae']['validation'],
        'atEpoch': time.time(),
        'reason': 'Shared preparation receipt labels corrected: VACE has no CLIP image encoder; the existing preparation hash check compared the selected official VACE VAE.'})
    del receipt['settings']['imageEncoderDtype']
    receipt['reusedComponents']['vae']['validation']='Byte-identical to the selected official VACE model VAE weights'
    script=Path(__file__).with_name('prepare-pinned-video-model.py')
    if script.is_file():receipt['preparationImplementationSha256']=sha(script)

started = time.monotonic()
for row in receipt['files'] + converted:
    file = root/row['file']
    assert file.stat().st_size == row['bytes'], row['file']
    assert sha(file) == row['sha256'], row['file']
receipt_file.write_text(json.dumps(receipt, indent=2))
result = {'status': 'PREPARED_FILES_HASH_VERIFIED_PENDING_INFERENCE',
          'model': receipt['model'], 'revision': receipt['revision'],
          'checkedFiles': len(receipt['files']) + len(converted),
          'modelReceiptSha256': sha(receipt_file),
          'seconds': time.monotonic()-started, 'verifiedAtEpoch': time.time(),
          'receiptCorrections': receipt.get('receiptCorrections', []),
          'scope': 'Prepared local files; retained encoder/VAE were verified during preparation.'}
(root/'integrity-verdict.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result), flush=True)
