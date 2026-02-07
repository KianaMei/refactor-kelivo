import type { RefObject } from 'react'

import type { ProviderConfigV2, AssistantConfig } from '../../../../shared/types'
import { AssistantSelectPopover } from '../../components/AssistantSelectPopover'
import { DesktopPopover } from '../../components/DesktopPopover'
import { ModelSelectPopover } from '../../components/ModelSelectPopover'

export function ChatPagePopovers(props: {
  // model
  modelCapsuleRef: RefObject<HTMLButtonElement | null>
  modelPickerOpen: boolean
  onCloseModelPicker: () => void
  providers: ProviderConfigV2[]
  currentProviderId?: string
  currentModelId?: string
  onSelectModel: (providerId: string, modelId: string) => void

  // assistant
  assistantCapsuleRef: RefObject<HTMLButtonElement | null>
  assistantPickerOpen: boolean
  onCloseAssistantPicker: () => void
  assistants: AssistantConfig[]
  activeAssistantId: string | null
  onSelectAssistant: (id: string) => void
  onManageAssistant?: () => void
}) {
  return (
    <>
      <DesktopPopover
        anchorRef={props.modelCapsuleRef}
        open={props.modelPickerOpen}
        onClose={props.onCloseModelPicker}
        minWidth={580}
        maxHeight={600}
        placement="below"
      >
        <ModelSelectPopover
          providers={props.providers}
          currentProviderId={props.currentProviderId}
          currentModelId={props.currentModelId}
          onSelect={props.onSelectModel}
          onClose={props.onCloseModelPicker}
        />
      </DesktopPopover>

      <DesktopPopover
        anchorRef={props.assistantCapsuleRef}
        open={props.assistantPickerOpen}
        onClose={props.onCloseAssistantPicker}
        minWidth={360}
        maxHeight={520}
        placement="below"
      >
        <AssistantSelectPopover
          assistants={props.assistants}
          activeId={props.activeAssistantId}
          onSelect={props.onSelectAssistant}
          onClose={props.onCloseAssistantPicker}
          onManage={props.onManageAssistant}
        />
      </DesktopPopover>
    </>
  )
}
