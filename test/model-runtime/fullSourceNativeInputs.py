"""Source-clock/native-input regressions without importing model runtimes."""
import ast
import copy
import tempfile
import unittest
from pathlib import Path
import numpy as np
from PIL import Image

source = Path('scripts/background-replacement/process-full-rate-podcast.py')
tree = ast.parse(source.read_text())
names = {'current_native_person_input', 'rebase_native_chunk_parameters'}
namespace = {'copy': copy, 'np': np, 'Image': Image}
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[]), str(source), 'exec'), namespace)
rebase = namespace['rebase_native_chunk_parameters']
native = namespace['current_native_person_input']


class FullSourceNativeInputs(unittest.TestCase):
    def fixture(self):
        return {'subjectId': 'real-person', 'initialBox': [.1,.1,.7,1],
                'points': [{'position':[.3,.2],'label':1}, {'position':[.3,.8],'label':1}],
                'shotPrompts':[{'frameIndex':12,'points':[{'position':[.4,.5],'label':1}]}],
                'components':[{'id':'moving-hand','shotPrompts':[{'frameIndex':23,'points':[{'position':[.5,.5],'label':0}]}]}]}

    def test_first_actual_photograph_keeps_garment_clicks_and_later_clocks(self):
        params=self.fixture();before=copy.deepcopy(params)
        result=rebase(params,100,100,148,[{'position':[.31,.21],'label':1}])
        self.assertEqual(result['points'],params['points'])
        self.assertEqual(result['shotPrompts'][0]['frameIndex'],12)
        self.assertEqual(result['components'][0]['shotPrompts'][0]['frameIndex'],23)
        self.assertEqual(params,before)

    def test_later_window_uses_its_current_face_and_rebases_real_corrections(self):
        params=self.fixture();current=[{'position':[.33,.23],'label':1}]
        result=rebase(params,100,116,148,current)
        self.assertEqual(result['points'],current)
        self.assertEqual(result['shotPrompts'],[])
        self.assertEqual(result['components'][0]['shotPrompts'][0]['frameIndex'],7)
        self.assertEqual(params['components'][0]['shotPrompts'][0]['frameIndex'],23)

    def test_camera_return_does_not_reuse_click_on_changed_source_patch(self):
        with tempfile.TemporaryDirectory() as directory:
            reference=np.full((40,60,3),100,np.uint8)
            file=Path(directory)/'reference.png';Image.fromarray(reference).save(file)
            primary=self.fixture();primary.pop('components')
            scene={'primarySelection':primary,'primaryReferenceFrame':0,'primaryReferenceRgb':str(file)}
            current=reference.copy();current[30:35,16:21]=200
            face=[{'position':[.31,.21],'label':1}]
            first=native(scene,current,0,face)
            self.assertEqual(first,primary)
            later=native(scene,current,120,face)
            self.assertEqual(later['points'],[face[0],primary['points'][0]])
            self.assertEqual(later['shotPrompts'],[])
            self.assertEqual(scene['primarySelection'],primary)


if __name__=='__main__':unittest.main()
