import { create } from 'domain'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getCreatePosts } from './util/subscription'
import { Database } from './db'

const keywords = [
  'mtgcube',
  'mtg cube',
  'cubecobra',
  'cube cobra',
  'cubecon',
  'hedron.network',
  'cube p1p1',
  'cube draft',
  'hedron network',
  'vertex mtg',
  'cube dungeon',
  'wa cube champs',
  'california cube championship',
  'cali cube champs',
  'capitol cube championship',
  'bopston cube party',
  'vintage cube',
  'legacy cube',
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
  constructor(public db: Database, public service: string) {
    super(db, service)

    // every second, log the number of posts processed since the last log
    setInterval(() => {
      const duration =
        (new Date().getTime() - this.startTimestamp.getTime()) / 1000
      console.log(`Processed ${this.numProcessed} posts in ${duration} seconds`)

      this.numProcessed = 0
      this.startTimestamp = new Date()
    }, 1000)
  }

  numProcessed = 0
  startTimestamp = new Date()

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getCreatePosts(evt)
    this.numProcessed += ops.length
    const postsToCreate = ops
      // the post must contain cube
      .filter((create) => create.record.text.toLowerCase().includes('cube'))
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
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
