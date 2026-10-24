/** Eligibility of an unsent suffix in the borrowed Lexical editor. */
import { $getRoot, $getSelection, $isElementNode, $isRangeSelection, type LexicalEditor } from 'lexical'

/**
 * Test the current selection inside a Lexical read or command callback.
 * @param editor - The editor that would receive the suggested suffix.
 * @returns Whether a collapsed, editable caret is at the end of the entire draft.
 */
export function $canAcceptPrediction(editor: LexicalEditor): boolean {
  if (!editor.isEditable() || editor.isComposing()) return false
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false
  const root = $getRoot()
  const last = root.getLastDescendant() ?? root
  const node = selection.focus.getNode()
  if ($isElementNode(node)) {
    return selection.focus.offset === node.getChildrenSize() && (node === last || node.getLastDescendant() === last)
  }
  return node === last && selection.focus.offset === node.getTextContentSize()
}
