import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { defaultShortcuts } from "../../shared/contracts";
type Actions = Record<keyof typeof defaultShortcuts, () => void>;
export function useKeyboardShortcuts(shortcuts: Record<keyof typeof defaultShortcuts, string>, actions: Actions) {
  const options = { preventDefault: true, enableOnFormTags: true };
  useHotkeys(shortcuts.sidebar, actions.sidebar, options, [actions]);
  useHotkeys(shortcuts.canvas, actions.canvas, options, [actions]);
  useHotkeys(shortcuts.chat, actions.chat, options, [actions]);
  useHotkeys(shortcuts.newConversation, actions.newConversation, options, [actions]);
  useHotkeys(shortcuts.composer, actions.composer, options, [actions]);
  useHotkeys(shortcuts.settings, actions.settings, options, [actions]);
  useHotkeys(shortcuts.search, actions.search, options, [actions]);
  useEffect(() => window.api.onMenu(action => actions[action as keyof Actions]?.()), [actions]);
}
