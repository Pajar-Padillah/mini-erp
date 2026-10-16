// Comments & attachments key for a WMS document form: a draft key while creating (moved to the
// saved document, or discarded when the dialog closes without saving) and the real key while editing.
import { onBeforeUnmount, ref } from 'vue'
import { docKey, draftDocKey, useDocCollabStore } from '../../stores/docCollabStore'

export function useDocCollabKey(docType: string) {
  const collab = useDocCollabStore()
  const key = ref('')
  let draft: string | null = null

  function dropDraft() {
    if (draft) collab.discard(draft)
    draft = null
  }
  /** Dialog opened for a new document. */
  function startCreate() {
    dropDraft()
    draft = draftDocKey(docType)
    key.value = draft
  }
  /** Dialog opened for an existing document. */
  function startEdit(id: string | number) {
    dropDraft()
    key.value = docKey(docType, id)
  }
  /** The new document was saved: move the draft thread to it. */
  function commit(id: string | number) {
    const real = docKey(docType, id)
    if (draft) collab.moveThread(draft, real)
    draft = null
    key.value = real
  }
  /** The document id changed while editing (e.g. renamed number). */
  function rename(oldId: string | number, newId: string | number) {
    if (String(oldId) === String(newId)) return
    const to = docKey(docType, newId)
    collab.moveThread(docKey(docType, oldId), to)
    key.value = to
  }
  /** Dialog closed: a draft that was never saved is thrown away. */
  const closed = dropDraft

  onBeforeUnmount(dropDraft)
  return { key, startCreate, startEdit, commit, rename, closed }
}
