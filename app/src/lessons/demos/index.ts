import type { ComponentType } from "react";
import { CacheDemo } from "./CacheDemo";
import { CopiesDemo } from "./CopiesDemo";
import { MixDemo } from "./MixDemo";
import { RaceDemo } from "./RaceDemo";
import { RegionsDemo } from "./RegionsDemo";
import { ReplicasDemo } from "./ReplicasDemo";
import { EdgeDemo } from "./EdgeDemo";
import { OneServerDemo } from "./OneServerDemo";
import { QueueDemo } from "./QueueDemo";
import { TimeoutDemo } from "./TimeoutDemo";
import { FanoutDemo } from "./FanoutDemo";
import { QueryPlanDemo } from "./QueryPlanDemo";
import { SearchDemo } from "./SearchDemo";
import { ShardKeyDemo } from "./ShardKeyDemo";
import { StaleDemo } from "./StaleDemo";
import { StreamDemo } from "./StreamDemo";
import { TransactionDemo } from "./TransactionDemo";
import { ChunksDemo } from "./ChunksDemo";
import { GeoStructureDemo } from "./GeoStructureDemo";
import { PoliteCrawlDemo } from "./PoliteCrawlDemo";
import { WordIndexDemo } from "./WordIndexDemo";
import { BudgetDemo } from "./BudgetDemo";
import { MatchingDemo } from "./MatchingDemo";
import { PaymentTapsDemo } from "./PaymentTapsDemo";
import { ReconcileDemo } from "./ReconcileDemo";
import { RegionFailureDemo } from "./RegionFailureDemo";
import { ALERTS, BIKES, BUDGET, FEE, OURS, THEIRS, budget, matchRiders, payTaps, reconcile, weatherAlerts } from "./realTimeModels";
import { CARDS, CRAWL, FILE, STANDS, bikeStands, crawl, upload, wordSearch } from "./mediaModels";
import { NOTES, PARCELS, SHOP, orderNotes, parcels, shop } from "./dataModels";
import { BATON, FANOUT, MOVE, STALE, fanout, moveMoney } from "./dataTeaching";
import { COPIES, EDGE, FORUM, NOTICES, ONE_SERVER, copies, edgeOrigin, forum, notices, oneServer } from "./analyzeModels";
import { MIX_DEMO, mixOutcome } from "./mixModel";
import { QUEUE_DEMO, runQueue } from "./queueModel";
import { RACE, playRace } from "./raceModel";
import { TIMEOUT_DEMO, timeoutOutcome } from "./timeoutModel";
import { CACHE_DEMO, cacheOutcome } from "./cacheModel";

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const cacheBefore = cacheOutcome(CACHE_DEMO.before);
const cacheAfter = cacheOutcome(CACHE_DEMO.after);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const busyDay = oneServer(ONE_SERVER.busyRps, ONE_SERVER.capacity);
const threeCopies = copies(3);
const timetable = edgeOrigin(0.9);
const ferry = mixOutcome(MIX_DEMO.ferryWriteShare);
const forumOne = forum(1, 1);
const forumThree = forum(3, 1);
const raceFree = playRace(false);
const raceLocked = playRace(true);
const noticesHome = notices(false, false);
const noticesBoth = notices(true, true);
const lunchQueue = runQueue({
  quiet: QUEUE_DEMO.quiet,
  rush: QUEUE_DEMO.rush,
  rushMinutes: QUEUE_DEMO.rushMinutes,
  drain: QUEUE_DEMO.workers * QUEUE_DEMO.perWorker,
});
const slowDay = timeoutOutcome(TIMEOUT_DEMO.slowTypicalMs, TIMEOUT_DEMO.slowTimeoutMs, true);
const shopNone = shop([]);
const shopBest = shop(["orders:customer_id,placed_at"]);
const shopMany = shop(["orders:customer_id,placed_at", "orders:placed_at", "orders:status", "orders:customer_id"], 0.5);
const parcelTime = parcels("scanned_at");
const parcelKey = parcels("parcel_id");
const notesPlain = orderNotes(false);
const notesIndexed = orderNotes(true);
const famousClub = fanout(FANOUT.clubs[2].members, "write");
const moveCut = moveMoney(false, true);
const moveSafe = moveMoney(true, true);
const cardPair = wordSearch(["lemon", "thyme"]);
const standGrid = bikeStands("Geohash grid", 1, 1);
const standTree = bikeStands("R-tree", 1, 1);
const standGridMoving = bikeStands("Geohash grid", 1, 1, 0.6);
const standTreeMoving = bikeStands("R-tree", 1, 1, 0.6);
const uploadAll = upload(FILE.sizeMB, false);
const uploadResumed = upload(100, true);
const crawlFound = crawl("found", 0);
const crawlPolite = crawl("perSite", CRAWL.comfortable);
const alertsServers = weatherAlerts("servers", true);
const alertsStandbySmall = weatherAlerts("servers-and-data", false);
const alertsStandbyFull = weatherAlerts("servers-and-data", true);
const bikesCity = matchRiders("city", 0.25);
const bikesCrowd = matchRiders("bike", 1);
const tapsPlain = payTaps(FEE.taps, false);
const tapsKey = payTaps(FEE.taps, true);
const booksReal = reconcile(true).filter((l) => l.finding !== "agree" && l.finding !== "late").length;
const booksNaive = reconcile(false).filter((l) => l.finding !== "agree").length;
const pizzaBad = budget({ loyalty: "before", suggest: "before" }, true);
const pizzaLimited = budget({ loyalty: "limited", suggest: "out" }, true);
const pizzaBackground = budget({ loyalty: "background", suggest: "background" }, false);

export interface DemoDef {
  title: string;
  /** which kind of model the demo uses, shown to the learner */
  model: "teaching" | "analyze";
  /** the demo in words, for the printed and read-as-one-page versions of a lesson */
  text: string;
  Component: ComponentType;
}

/** Every demo a lesson can name with `::: demo <id>`. Add new demos here; content validation checks lessons against these ids. */
export const DEMOS: Record<string, DemoDef> = {
  "d1-cache": {
    title: "Predict the database load",
    model: "teaching",
    text: `Teaching model. A page gets ${n(CACHE_DEMO.readsPerSec)} reads a second. With a ${CACHE_DEMO.before * 100}% hit ratio the cache lets ${n(cacheBefore.dbReadsPerSec)} reads a second through to the database. If the hit ratio drops to ${CACHE_DEMO.after * 100}%, ${n(cacheAfter.dbReadsPerSec)} reads a second get through: ${n(cacheAfter.dbReadsPerSec / cacheBefore.dbReadsPerSec)} times the load, and more than the database (assumed to answer ${n(CACHE_DEMO.dbReadsPerSec)} reads a second) can serve. The numbers are invented; the model has no keys, expiry or hot items, and assumes every request is a read.`,
    Component: CacheDemo,
  },
  "d0-one-server": {
    title: "What happens when one server is full?",
    model: "analyze",
    text: `Uses the app's simulator. A bakery's order page runs on one server that handles ${n(ONE_SERVER.capacity)} requests a second. On a normal day ${n(ONE_SERVER.quietRps)} arrive and all are served. On a busy Saturday ${n(ONE_SERVER.busyRps)} arrive, so ${pct(busyDay.served)} are served and the rest are not. The numbers are invented; there is one server and it does not scale itself up.`,
    Component: OneServerDemo,
  },
  "d0-copies": {
    title: "What do extra copies buy you?",
    model: "analyze",
    text: `Uses the app's simulator. The bakery runs 3 copies of its server behind a load balancer, each handling ${n(COPIES.capacityEach)} requests a second, with ${n(COPIES.rps)} arriving. If one copy fails, two remain and handle ${n(2 * COPIES.capacityEach)}, so ${pct(threeCopies.oneDown.served)} of requests are still served. A single copy that fails leaves nothing standing. Each copy adds to the monthly cost. The numbers are invented; copies are identical and keep no shared state.`,
    Component: CopiesDemo,
  },
  "d0-edge-origin": {
    title: "How much does a CDN take off the origin?",
    model: "analyze",
    text: `Uses the app's simulator. ${n(EDGE.rps)} requests a second arrive for a school timetable PDF and the origin, which is blob storage, answers ${n(EDGE.originCapacity)}. Without a CDN ${pct(timetable.withoutCdn.served)} are served. With a CDN answering 90% at the edge, ${n(timetable.withCdn.reaching)} requests a second reach the origin and all are served, at some extra monthly cost. The numbers are invented; every request is a read, and the model never loses a file.`,
    Component: EdgeDemo,
  },
  "d1-mix": {
    title: "Which limit does the mix reach first?",
    model: "teaching",
    text: `Teaching model. A recipe site and a ferry booking page each receive ${n(MIX_DEMO.requestsPerSec)} requests a second, using a database that answers ${n(MIX_DEMO.readLimit)} reads and ${n(MIX_DEMO.writeLimit)} writes a second. The ferry page is half writes: ${n(ferry.writes)} writes a second against a limit of ${n(ferry.writeLimit)}, so the write limit is passed even though its reads are far inside theirs. At that mix the database can take about ${n(ferry.maxTotal)} requests a second in total. The numbers are invented.`,
    Component: MixDemo,
  },
  "d1-replicas": {
    title: "What do copies add, and what do slices add?",
    model: "analyze",
    text: `Uses the app's simulator. A forum receives ${n(FORUM.rps)} requests a second. With one read copy its database can answer ${n(forumOne.readLimit)} reads and ${n(forumOne.writeLimit)} writes a second. With three read copies the read limit rises to ${n(forumThree.readLimit)} and the write limit stays at ${n(forumThree.writeLimit)}: copies add read capacity, not write capacity. Slices of the data raise both limits, but a request has to say which slice it needs. A copy can be a moment behind the original, and the app does not model that. The numbers are invented.`,
    Component: ReplicasDemo,
  },
  "d1-race": {
    title: "Two withdrawals at once",
    model: "teaching",
    text: `Teaching model. Two housemates share an account holding ${RACE.start} and each withdraws ${RACE.amount} at the same moment. With nothing to stop the steps overlapping, both read ${RACE.start}, and the account ends at ${raceFree.finalBalance} instead of ${raceFree.expected}: one withdrawal is lost. With a lock, the second housemate waits, reads the new balance and the account ends at ${raceLocked.finalBalance}. The lock costs a wait. This is one fixed order of steps, not the app's simulator.`,
    Component: RaceDemo,
  },
  "d1-regions": {
    title: "Where does the time go?",
    model: "analyze",
    text: `Uses the app's simulator. A school-notices app has readers in three regions and its server and database are in US East. A reader in US East waits about ${n(noticesHome.byRegion.us)} ms, in Europe about ${n(noticesHome.byRegion.eu)} ms and in Asia Pacific about ${n(noticesHome.byRegion.ap)} ms. A server in each region does not help while the data stays in US East. Servers plus a read copy of the data in each region bring every region to about ${n(noticesBoth.byRegion.us)} ms for reads. Writes still go to US East. The delays are the app's own fixed simplification, not a rule for real systems. Readers: ${pct(NOTICES.mix.us)} US East, ${pct(NOTICES.mix.eu)} Europe, ${pct(NOTICES.mix.ap)} Asia Pacific.`,
    Component: RegionsDemo,
  },
  "d2-queue": {
    title: "Watch a backlog grow and drain",
    model: "teaching",
    text: `Teaching model. A café takes ${n(QUEUE_DEMO.quiet)} orders a minute on a quiet day. Two baristas make ${n(QUEUE_DEMO.workers * QUEUE_DEMO.perWorker)} drinks a minute between them. During a ${n(QUEUE_DEMO.rushMinutes)}-minute lunch rush, ${n(QUEUE_DEMO.rush)} orders a minute arrive, so the backlog grows by ${n(QUEUE_DEMO.rush - QUEUE_DEMO.workers * QUEUE_DEMO.perWorker)} a minute to ${n(lunchQueue.peakBacklog)} orders, and the last customer waits ${lunchQueue.longestWait} minutes. After the rush the backlog is empty again at minute ${lunchQueue.clearedAt}. If orders kept arriving faster than they are made, the backlog would grow for ever with no error. The numbers are invented.`,
    Component: QueueDemo,
  },
  "d2-timeout": {
    title: "What does a timeout tell you?",
    model: "teaching",
    text: `Teaching model. A delivery app asks a postcode service to find an address. On a bad day the service takes about ${n(TIMEOUT_DEMO.slowTypicalMs)} ms, and the app gives up after ${n(TIMEOUT_DEMO.slowTimeoutMs)} ms and shows the address as typed, so every visitor waits ${n(slowDay.averageWaitMs)} ms and still sees the page. The timeout only tells the app it stopped waiting: the service may still have done the lookup. A timeout shorter than the service's usual time throws away healthy answers. The numbers are invented and the spread of response times is simplified.`,
    Component: TimeoutDemo,
  },
  "d3-query-plan": {
    title: "How much work is one question?",
    model: "analyze",
    text: `Uses the app's simulator. A town shop keeps ${n(SHOP.rows)} orders. Finding a customer's three latest with no index reads every row: about ${n(shopNone.readUnits)} units of work against about ${shopBest.bestUnits.toFixed(1)} for the best plan, so the shop serves ${pct(shopNone.served)} of its ${n(SHOP.rps)} requests a second. An index on the customer and then the date brings it to the best plan and serves ${pct(shopBest.served)}. Every index makes taking an order dearer: with four indexes on a half-writes mix the most writes a second falls from ${n(shop(["orders:customer_id,placed_at"], 0.5).writeLimit)} to ${n(shopMany.writeLimit)}. The shop and its numbers are invented; the app allows six indexes at most.`,
    Component: QueryPlanDemo,
  },
  "d3-shard-key": {
    title: "Which key spreads the load?",
    model: "analyze",
    text: `Uses the app's simulator. A delivery company logs ${n(PARCELS.rows)} scans in ${PARCELS.shards} slices. With the time of the scan as the key, about ${pct(parcelTime.busiest)} of the work lands on one slice and ${pct(parcelTime.served)} of requests are served. With the parcel number, the work is spread almost evenly and ${pct(parcelKey.served)} are served, and a parcel's history goes to one slice. A depot list, which does not name the parcel, is then asked of every slice. No key suits every question. The company and its numbers are invented.`,
    Component: ShardKeyDemo,
  },
  "d3-search": {
    title: "Where should a word search go?",
    model: "analyze",
    text: `Uses the app's simulator. The shop's ${n(NOTES.rows)} order notes are searched for words. With every search sent to the main database the app warns: ${notesPlain.searchFinding ? "text queries scan the stored data and slow other queries" : "no warning"}. With a search index the warning goes${notesIndexed.searchFinding ? " (it did not in the run)" : ""}, at an extra cost of about $${Math.round(notesIndexed.monthlyCost - notesPlain.monthlyCost).toLocaleString("en-US")} a month. The index is a second copy and can be a moment behind. The app does not model how words are matched, or that delay. The numbers are invented.`,
    Component: SearchDemo,
  },
  "d3-transaction": {
    title: "Both steps, or neither",
    model: "teaching",
    text: `Teaching model. A person moves ${MOVE.amount} from savings (${MOVE.savings}) to current (${MOVE.current}) in two steps, and the power fails after the first. With nothing grouping the steps, savings is ${moveCut.savings}, current is ${moveCut.current} and ${moveCut.total} is left in all: ${MOVE.amount} has vanished. In a transaction the unfinished move is undone and the total is ${moveSafe.total}. A stronger setting also makes someone adding up the balances wait, and makes writes slower. This is one database on one machine, not the app's simulator.`,
    Component: TransactionDemo,
  },
  "d3-fanout": {
    title: "Who writes the copies?",
    model: "teaching",
    text: `Teaching model. A famous club has ${n(FANOUT.clubs[2].members)} members. Copying a notice into every member's pigeonhole at ${n(FANOUT.copiesPerSec)} copies a second takes ${n(famousClub.secondsToReach)} seconds, about 13 minutes, before the last member sees it. Picking the notice out when a member looks makes posting one copy, but each view looks in ${FANOUT.follows} places instead of one. Small clubs do well with copying ahead. The numbers are invented and the model counts only copies and lookups.`,
    Component: FanoutDemo,
  },
  "d3-stream-order": {
    title: "A log you can read again",
    model: "teaching",
    text: `Teaching model. A relay team's ${BATON.events.length} events are written to a stream with ${BATON.parts} parts, and to a queue. After a program reads the first four, the stream still holds all ${BATON.events.length} and a reader can go back and read them again; the queue holds only the 2 jobs left, because finished jobs are gone. Order is kept for events with the same key, such as one runner. Replay only works while events are kept, and the app counts a stream as able to replay when it keeps them at least ${BATON.replayHours} hours. This is a fixed example, not the app's simulator.`,
    Component: StreamDemo,
  },
  "d3-stale": {
    title: "Is the site broken, or just behind?",
    model: "teaching",
    text: `Teaching model. A comment is saved in the original database, and a copy catches up about ${STALE.copyLagSec} seconds later. A refresh one second after posting, read from the copy, does not show the comment yet: that is a stale read, not a broken site. Reading from the original is always fresh but it carries all the load. The app does not model the delay: it treats every copy as up to date. The numbers are invented.`,
    Component: StaleDemo,
  },
  "d4-word-index": {
    title: "Reading lists, not cards",
    model: "teaching",
    text: `Teaching model. A box holds ${n(CARDS.total)} recipe cards, with lemon on ${n(CARDS.words[0].cards)} and thyme on ${n(CARDS.words[1].cards)}. Checking every card opens ${n(cardPair.scanCards)}. With a list of cards for each word, a search for both words reads ${n(cardPair.listEntries)} list entries and opens only the ${n(cardPair.matches)} or so cards on both. The price is that adding a card means adding it to the list of each of its ${CARDS.wordsPerCard} words. A common word such as salt has a very long list. The numbers are invented, and the model does not rank results or forgive spelling mistakes.`,
    Component: WordIndexDemo,
  },
  "d4-geo-structure": {
    title: "Which structure suits which traffic?",
    model: "analyze",
    text: `Uses the app's simulator. A bike-share app has ${n(STANDS.rps)} requests a second, nearly all of them "find the nearest stand". With one area and one copy, a geohash grid answers up to ${n(standGrid.queryLimit)} questions a second and an R-tree up to ${n(standTree.queryLimit)}, so the R-tree serves ${pct(standTree.served)} of the traffic against the grid's ${pct(standGrid.served)}. If most requests move a place, like a fleet of cars, the R-tree costs most to update and serves ${pct(standTreeMoving.served)} against the grid's ${pct(standGridMoving.served)}. Copies add question capacity and not update capacity, and more areas spread a crowded centre. The app gives each structure a multiplier and does not draw maps. The numbers are invented.`,
    Component: GeoStructureDemo,
  },
  "d4-chunks": {
    title: "Starting again, or carrying on",
    model: "teaching",
    text: `Teaching model. A ${n(FILE.sizeMB)} MB video is uploaded at ${FILE.speedMBps} MB a second and the connection drops at ${FILE.failsAt * 100}%. Sent as one piece, everything goes again: ${n(uploadAll.sentMB)} MB in all, about ${n(uploadAll.seconds / 60)} minutes. In 100 MB pieces, the pieces that arrived are kept, only the rest is sent, and ${n(uploadResumed.sentMB)} MB goes in all, about ${n(uploadResumed.seconds / 60)} minutes. Very small pieces pay a lot of overhead and very large pieces lose more, so a middle size is usually quickest. The numbers are invented and the app does not model a transfer breaking off.`,
    Component: ChunksDemo,
  },
  "d4-polite-crawl": {
    title: "One limit, or one limit per site?",
    model: "teaching",
    text: `Teaching model. A crawler has ${n(CRAWL.sites.reduce((a, s) => a + s.addresses, 0))} addresses on three sites and can make ${CRAWL.globalPerSec} requests a second in all. With one limit for the whole crawler and the big site's addresses first, the big site receives ${n(crawlFound.peakPerSite)} requests a second, about four times the ${CRAWL.comfortable} it copes with comfortably. With a limit of ${CRAWL.comfortable} a second for each site, no site is pushed too hard, and the crawl takes about ${n(crawlPolite.seconds)} seconds instead of ${n(crawlFound.seconds)}. The app has only one global rate limiter, so a per-site limit is judged by what is written. The numbers are invented.`,
    Component: PoliteCrawlDemo,
  },
  "d5-region-failure": {
    title: "What survives when a region is lost?",
    model: "analyze",
    text: `Uses the app's simulator. A weather-alert app gets ${n(ALERTS.rps)} requests a second, ${pct(ALERTS.mix.us)} from US East and ${pct(ALERTS.mix.eu)} from Europe. With servers in both regions but the database only in US East, losing US East leaves ${pct(alertsServers.downServed)} of requests served: the servers work but the data is gone. With a copy of the data in Europe the copy takes over, but servers sized for only their own region's share serve ${pct(alertsStandbySmall.downServed)}. Sized to carry everything, they serve ${pct(alertsStandbyFull.downServed)}, at a higher monthly cost. How long the switch takes, and the last writes that had not reached the copy, are not modelled. The numbers are invented.`,
    Component: RegionFailureDemo,
  },
  "d5-matching": {
    title: "Whose bike is it?",
    model: "teaching",
    text: `Teaching model. ${BIKES.riders} visitors ask for the nearest free festival bike in the same second, and there are ${BIKES.perArea} bikes in each of ${BIKES.areas} areas. A claim holds a lock for ${BIKES.claimMs} ms. With one lock for the whole festival the last visitor waits ${n(bikesCity.lastAnswerMs)} ms. With a lock on each bike visitors who want different bikes go at once, and the last one waits ${n(bikesCrowd.lastAnswerMs)} ms. If every visitor is in one area, only ${bikesCrowd.matched} get a bike and ${bikesCrowd.turnedAway} are turned away: a lock cannot create bikes. The numbers are invented, and the model assumes visitors want different bikes where possible.`,
    Component: MatchingDemo,
  },
  "d5-payment-taps": {
    title: "Tap, tap, tap",
    model: "teaching",
    text: `Teaching model. A £${FEE.pounds} gym fee is tapped ${FEE.taps} times because the screen hangs, and every tap reaches the payment system. With no key to recognise a repeat, the card is charged £${tapsPlain.customerOut} and ${tapsPlain.ledgerLines.length} ledger lines are added. With the same key on every tap, the first is carried out and the others are told its result: £${tapsKey.customerOut} and ${tapsKey.ledgerLines.length} lines. The lines in a ledger are only added, in pairs that sum to nothing. The numbers are invented, and the model does not send duplicate requests.`,
    Component: PaymentTapsDemo,
  },
  "d5-reconcile": {
    title: "Do the books agree?",
    model: "teaching",
    text: `Teaching model. Your books list ${OURS.length} payments and the provider's statement lists ${THEIRS.length}. Compared by payment id, ${booksNaive} lines do not agree, but one was made after the provider's cut-off and is on tomorrow's statement. The ${booksReal} real problems are a wrong amount, a charge only we recorded, and a charge only the provider has. They go to a person to review. The numbers are invented, and the model does not decide what to do about a difference.`,
    Component: ReconcileDemo,
  },
  "d5-budget": {
    title: "Fit the time and the money",
    model: "teaching",
    text: `Teaching model. A pizza shop's order page must answer within ${BUDGET.ms} ms and cost no more than $${BUDGET.dollars} a month. With both optional steps done before answering, a bad day takes ${n(pizzaBad.ms)} ms. Putting both in the background takes the wait to ${pizzaBackground.ms} ms but costs $${pizzaBackground.dollars}, over the budget. Giving the discount a time limit and leaving out the suggestion holds a bad day to ${pizzaLimited.ms} ms for $${pizzaLimited.dollars}. The numbers are invented.`,
    Component: BudgetDemo,
  },
};

export const DEMO_IDS = Object.keys(DEMOS);
