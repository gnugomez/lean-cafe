import type * as Y from 'yjs'
import type { Ref } from 'vue'

export function createRoomOwnership(opts: {
  metaMap: Y.Map<any>
  uid: string
  ownerToken: string | null
  ownerId: Ref<string | null>
}) {
  const { metaMap, uid, ownerToken, ownerId } = opts

  const isOwner = computed(() => !!ownerToken && !!ownerId.value && ownerToken === ownerId.value)

  // The raw token lives only in the creator's browser; the shared doc holds
  // the current owner's token + uid so peers agree on who owns the room.
  function reclaimOwnership() {
    if (!ownerToken) return
    if (!metaMap.get('ownerToken')) {
      metaMap.set('ownerToken', ownerToken)
      metaMap.set('ownerUid', uid)
    } else if (metaMap.get('ownerToken') === ownerToken && metaMap.get('ownerUid') !== uid) {
      metaMap.set('ownerUid', uid)
    }
  }

  return { isOwner, reclaimOwnership }
}
