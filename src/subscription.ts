import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

const keywords = [
  'mtgcube',
  'mtg cube',
  'cube cobra',
  'cubecobra',
  'cubecon',
  'cube con',
  'cube p1p1',
]

const authorIds = [
  'did:plc:qqoeudogjlk642cfhcjvyai6', // boston cube party
  'did:plc:3zmrjky2gnynxe56gnaphsig', // cube cobra
  'did:plc:o7ukgfsxj57bu62lh7uozhi3', // hedron network
  'did:plc:lxvz3wb6wmjqyjbbl7nwp3ev', // vertex mtg
  'did:plc:blslolyotcpwvzdoiazprxcg', // cube dungeon
  'did:plc:yumab7xqnjq5mkekiuw2chzz', // wa cube champs
  'did:plc:htrj3qn4pszn7tc56nxzs5it', // capitol cube championship
]

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // only keep posts that contain a keyword, or are from a user we care about
        return (
          keywords.some((keyword) =>
            create.record.text.toLowerCase().includes(keyword),
          ) || authorIds.includes(create.author)
        )
      })
      .map((create) => {
        // map posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      console.log(`Adding ${postsToCreate.length} posts`)

      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
