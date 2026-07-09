import { isExtensionChannelEnabled } from '../extension/extension-channel.config';
import { isExtensionTaskPipelineEnabled } from '../extension/extension-task.config';
import {
  getExtensionRolloutStage,
  isExtensionRolloutEnabled,
  isExtensionRolloutKillSwitchActive,
} from '../extension/extension-rollout.config';
import { isExtensionFirstTradeFlowEnabled } from '../trades/extension-trade-flow.config';
import { isSettlementHoldWindowEnabled } from '../settlement/settlement-hold.config';
import { isExtensionUiTradeFlowEnabled } from './extension-ui-trade-flow.config';

export type ExtensionPublicConfig = {
  extensionChannelEnabled: boolean;
  extensionTaskPipelineEnabled: boolean;
  extensionFirstTradeFlowEnabled: boolean;
  extensionUiTradeFlowEnabled: boolean;
  settlementHoldWindowEnabled: boolean;
  extensionRolloutEnabled: boolean;
  extensionRolloutStage: string;
  extensionRolloutKillSwitch: boolean;
};

export function getExtensionPublicConfig(): ExtensionPublicConfig {
  return {
    extensionChannelEnabled: isExtensionChannelEnabled(),
    extensionTaskPipelineEnabled: isExtensionTaskPipelineEnabled(),
    extensionFirstTradeFlowEnabled: isExtensionFirstTradeFlowEnabled(),
    extensionUiTradeFlowEnabled: isExtensionUiTradeFlowEnabled(),
    settlementHoldWindowEnabled: isSettlementHoldWindowEnabled(),
    extensionRolloutEnabled: isExtensionRolloutEnabled(),
    extensionRolloutStage: getExtensionRolloutStage(),
    extensionRolloutKillSwitch: isExtensionRolloutKillSwitchActive(),
  };
}
