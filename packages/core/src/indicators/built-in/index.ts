import { Registry } from '../../utils/registry';
import type { IndicatorDefinition } from '../types';
import { BIAS, CCI, KDJ, MACD, ROC, RSI, WR } from './momentum';
import { BOLL, EMA, MA, SMMA } from './overlays';
import { ATR, DMI, STD } from './volatility';
import { EMV, MFI, OBV, VOL, VR } from './volume';

export function createIndicatorRegistry(): Registry<IndicatorDefinition> {
  const builtIns: Record<string, IndicatorDefinition> = {
    MA,
    EMA,
    SMMA,
    BOLL,
    VOL,
    MACD,
    RSI,
    KDJ,
    WR,
    CCI,
    ROC,
    BIAS,
    OBV,
    VR,
    EMV,
    MFI,
    ATR,
    STD,
    DMI
  };
  return new Registry('indicator', builtIns);
}
