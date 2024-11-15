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
]

const authorIds = [
  'did:plc:qqoeudogjlk642cfhcjvyai6', // boston cube party
  'did:plc:3zmrjky2gnynxe56gnaphsig', // cube cobra
  'did:plc:o7ukgfsxj57bu62lh7uozhi3', // hedron network
  'did:plc:lxvz3wb6wmjqyjbbl7nwp3ev', // vertex mtg
  'did:plc:blslolyotcpwvzdoiazprxcg', // cube dungeon
  'did:plc:yumab7xqnjq5mkekiuw2chzz', // wa cube champs
]

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    for (const post of ops.posts.creates) {
      console.log(post.record.text)
    }

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
        // map alf-related posts to a db row
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
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
