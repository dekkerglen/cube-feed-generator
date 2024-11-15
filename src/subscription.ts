import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import {
  FirehoseSubscriptionBase,
  getOpsByType,
  CreateOp,
} from './util/subscription'
import { Record } from './lexicon/types/app/bsky/feed/post'

const keywords = [
  'mtgcube',
  'cubecobra',
  'cubecon',
  'luckypaper',
  'hedronnetwork',
  'hedron.network',
]

const keybigrams = [
  ['mtg', 'cube'],
  ['cube', 'cobra'],
  ['cube', 'con'],
  ['cube', 'p1p1'],
  ['cube', 'draft'],
  ['hedron', 'network'],
]

const authorIds = [
  'did:plc:qqoeudogjlk642cfhcjvyai6', // boston cube party
  'did:plc:3zmrjky2gnynxe56gnaphsig', // cube cobra
  'did:plc:o7ukgfsxj57bu62lh7uozhi3', // hedron network
  'did:plc:lxvz3wb6wmjqyjbbl7nwp3ev', // vertex mtg
  'did:plc:blslolyotcpwvzdoiazprxcg', // cube dungeon
  'did:plc:yumab7xqnjq5mkekiuw2chzz', // wa cube champs
  'did:plc:htrj3qn4pszn7tc56nxzs5it', // capitol cube championship
  'did:plc:nvxbpmi4s2n4q7hydbspitus', // cubecon
]

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter(this.filterPost)
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
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }

  filterPost(create: CreateOp<Record>) {
    // Split the post text into words
    const words = create.record.text.toLowerCase().split(/\s+/)
    const bigrams = words
      .slice(0, -1)
      .map((word, i) => [word, words[i + 1]])
      .filter((bigram) => bigram.every((word) => word.length > 2))

    // Check if any of the words match any of the keywords
    const containsKeyword = keywords.some((keyword) => words.includes(keyword))

    // Check if any of the bigrams match any of the keybigrams
    const containsBigram = keybigrams.some((keybigram) =>
      bigrams.some((bigram) =>
        bigram.every((word, i) => word === keybigram[i]),
      ),
    )

    // Check if the author is in the list of authorIds
    const isAuthorMatch = authorIds.includes(create.author)

    // Return true if either condition is met
    return containsKeyword || isAuthorMatch || containsBigram
  }
}
