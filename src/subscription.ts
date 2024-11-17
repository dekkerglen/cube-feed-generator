import { create } from 'domain'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { AppBskyGraphDefs, BskyAgent } from '@atproto/api'
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
  authorIds: string[] = []

  async init() {
    const agent = new BskyAgent({
      service: 'https://public.api.bsky.app'
    })
    let cursor: string | undefined
    let members: AppBskyGraphDefs.ListItemView[] = []
    do {
      let res = await agent.app.bsky.graph.getList({
        list: 'at://did:plc:myu2zwvuws3qbqdfoccpqcyh/app.bsky.graph.list/3layzlk6p322l',
        limit: 30,
        cursor
      })
      cursor = res.data.cursor
      members = members.concat(res.data.items)
    } while (cursor)
    this.authorIds = members.map(member => member.subject.did)
  }

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
          ) || this.authorIds.includes(create.author)
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
