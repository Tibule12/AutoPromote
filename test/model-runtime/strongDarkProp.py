"""Real dark equipment may share the source background's colour."""
import unittest
import numpy as np
from model_workers.adapters.source_edge_alpha import classify_corrected_fixed_object

class StrongDarkProp(unittest.TestCase):
 def test_source_background_colour_cannot_erase_strong_stem_but_explicit_correction_wins(self):
  rgb=np.full((100,160,3),[20,25,30],np.uint8);rgb[30:70,25:50]=[130,70,40]
  alpha=np.zeros((100,160),np.uint8);evidence=np.zeros_like(alpha)
  alpha[30:70,25:50]=255;evidence[30:70,25:50]=210
  alpha[25:80,50:52]=255;evidence[25:80,50:52]=220
  points=[dict(position=[x/160,y/100],label=label)for x,y,label in [(35,40,1),(35,50,1),(35,60,1),(60,30,0),(60,50,0),(60,80,0)]]
  result=classify_corrected_fixed_object(rgb,alpha,rgb,points,[0,0,160,100],evidence,
      source_seeded_foreground=True,bounded_source_growth=True)
  self.assertEqual(result[50,50],255);self.assertEqual(result[50,35],255)
  # Narrow authored source correction, as distinct from a global colour key.
  points.append(dict(position=[50/160,50/100],label=0))
  corrected=classify_corrected_fixed_object(rgb,alpha,rgb,points,[0,0,160,100],evidence,
      source_seeded_foreground=True,bounded_source_growth=True)
  self.assertEqual(corrected[50,50],0);self.assertEqual(corrected[45,50],255)
  self.assertEqual(corrected[50,35],255);self.assertEqual(corrected[10,10],0)

if __name__=='__main__':unittest.main()
