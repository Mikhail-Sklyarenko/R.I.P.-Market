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
import { isExtensionTradeAcknowledgmentEnabled } from './extension-trade-ack.config';

export type ExtensionPublicConfig = {
  extensionChannelEnabled: boolean;
  extensionTaskPipelineEnabled: boolean;
  extensionFirstTradeFlowEnabled: boolean;
  extensionUiTradeFlowEnabled: boolean;
  extensionTradeAcknowledgmentEnabled: boolean;
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
    extensionTradeAcknowledgmentEnabled:
      isExtensionTradeAcknowledgmentEnabled(),
    settlementHoldWindowEnabled: isSettlementHoldWindowEnabled(),
    extensionRolloutEnabled: isExtensionRolloutEnabled(),
    extensionRolloutStage: getExtensionRolloutStage(),
    extensionRolloutKillSwitch: isExtensionRolloutKillSwitchActive(),
  };
}
