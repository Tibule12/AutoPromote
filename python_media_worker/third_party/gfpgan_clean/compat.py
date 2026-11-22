"""Minimal inference registry and the original BasicSR initialization rule.

All parameters are overwritten by a strict, hash-verified checkpoint load.
"""
class Registry:
    def register(self):
        return lambda cls:cls
ARCH_REGISTRY=Registry()

def default_init_weights(module_list,scale=1,bias_fill=0,**kwargs):
    import torch
    from torch import nn
    modules=module_list if isinstance(module_list,list)else[module_list]
    with torch.no_grad():
        for root in modules:
            for module in root.modules():
                if isinstance(module,(nn.Conv2d,nn.Linear)):
                    nn.init.kaiming_normal_(module.weight,**kwargs)
                    module.weight.mul_(scale)
                    if module.bias is not None:nn.init.constant_(module.bias,bias_fill)
                elif isinstance(module,nn.BatchNorm2d):
                    nn.init.constant_(module.weight,1)
                    if module.bias is not None:nn.init.constant_(module.bias,bias_fill)
