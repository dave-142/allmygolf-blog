// Fills in round scores from a Garmin Connect export, and creates posts for Garmin rounds that have none.
//
// Usage (from the project folder):
//   npm run import-garmin              read Golf-COURSE.json and Golf-SCORECARD.json from the project folder
//   npm run import-garmin -- <folder>  read them from another folder
//   npm run import-garmin -- --dry-run show what would change, change nothing
//
// - Only complete 18-hole rounds are used.
// - Garmin courses are matched to course ids with GARMIN_COURSES below. Rounds at a course that is not listed
//   are skipped and reported, so you can add it.
// - A round matches a post with the same course on the same date. If none, a post at the same course up to
//   2 days away counts (photo folders are sometimes dated a day out). Each post and round is used once.
// - Matched posts get Garmin's total strokes as their score, replacing any score already there.
// - Rounds with no post get a new one, named and laid out like import-photos posts, with no photos.
// - Courses with no par (missing or 0) in courses.json get one worked out from the Garmin rounds. Pars you have
//   entered are never changed; any that differ from Garmin are listed.
// - Running it again is safe: rounds already imported match their posts and only the score is rewritten.
// - The Garmin files hold personal data and are listed in .gitignore. Keep them out of git.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = path.join(ROOT, 'src/content/blog');
const COURSES_FILE = path.join(ROOT, 'src/data/courses.json');
const NEAR_DAYS = 2;

// Garmin course id (courseSnapshotId) -> course id in src/data/courses.json
const GARMIN_COURSES = {
	203741: 'ballumbie',
	482601: 'balnagask',
	125837: 'banchory',
	190392: 'burntisland',
	139165: 'carnwath',
	551535: 'charleton',
	208529: 'craigiehill',
	252093: 'craigielaw',
	189232: 'crail-balcomie',
	218513: 'drumoig',
	185488: 'standrews-craigtoun', // Garmin still calls it the Dukes course
	472411: 'dumbarnie',
	222347: 'dundonald-links',
	201644: 'dunfermline-pitfirrane',
	204151: 'fairmont-kittocks',
	252028: 'fairmont-torrance',
	208532: 'the-glen',
	194028: 'gleneagles-kings',
	212077: 'gullane-no2',
	239635: 'harburn',
	97876: 'hazelhead',
	203777: 'salgados',
	407021: 'kings-links',
	194960: 'kingsbarns',
	191313: 'kinross-mongomerie',
	189192: 'ladybank',
	185994: 'lundin-links',
	200795: 'cardrona-hotel',
	193295: 'machrihanish-dunes',
	204741: 'meldrum-house',
	203664: 'moray-old',
	113864: 'murcar-links',
	496196: 'murcar-links',
	95962: 'newburgh-on-ythan',
	229325: 'peterculter',
	206708: 'dunfermline-pitreavie',
	282986: 'dunfermline-pitreavie',
	195716: 'portlethen',
	198935: 'ratho-park',
	229545: 'royal-aberdeen',
	5960: 'royal-dornoch',
	203577: 'royal-musselburgh',
	190931: 'strathmore',
	218401: 'turnberry-ailsa',
	288738: 'turnberry-king-robert-the-bruce',
	195757: 'west-linton',
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? ROOT);

const readGarmin = (name) => {
	const file = path.join(sourceDir, name);
	if (!fs.existsSync(file)) {
		console.error(`Cannot find ${file}`);
		process.exit(1);
	}
	return JSON.parse(fs.readFileSync(file, 'utf8')).data;
};
const garminNames = Object.assign({}, ...readGarmin('Golf-COURSE.json'));
const scorecards = readGarmin('Golf-SCORECARD.json');
const courses = new Map(JSON.parse(fs.readFileSync(COURSES_FILE, 'utf8')).courses.map((c) => [c.id, c]));

// The day the round was played, in UK time
const ukDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 86400000;
const frontmatterValue = (text, key) =>
	text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].replace(/^["']|["']$/g, '').trim();

// Existing round posts
const posts = fs
	.readdirSync(BLOG_DIR)
	.filter((f) => f.endsWith('.md'))
	.map((file) => {
		const text = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
		return {
			file,
			text,
			course: frontmatterValue(text, 'course'),
			date: frontmatterValue(text, 'pubDate')?.slice(0, 10),
			score: frontmatterValue(text, 'score'),
		};
	})
	.filter((p) => p.course && p.date);

// Complete rounds at known courses
const skipped = new Map(); // Garmin course name -> rounds
const rounds = [];
for (const card of scorecards) {
	if (card.holesCompleted !== 18 || card.inProgress) continue;
	const course = GARMIN_COURSES[card.courseSnapshotId];
	if (!course || !courses.has(course)) {
		const name = garminNames[card.courseSnapshotId] ?? `Garmin course ${card.courseSnapshotId}`;
		skipped.set(name, (skipped.get(name) ?? 0) + 1);
		continue;
	}
	rounds.push({ course, date: ukDate(card.startTime), strokes: card.strokes, start: card.startTime });
}
rounds.sort((a, b) => a.start.localeCompare(b.start));

// Posts with a Garmin round of their own that day (of any length) never borrow a round from a nearby day
const playedThatDay = new Set(
	scorecards
		.filter((card) => GARMIN_COURSES[card.courseSnapshotId])
		.map((card) => `${GARMIN_COURSES[card.courseSnapshotId]} ${ukDate(card.startTime)}`),
);

// Pair rounds with posts: same date first, then up to NEAR_DAYS away
const usedPosts = new Set();
const pairs = [];
const unpaired = [];
for (const pass of ['same', 'near']) {
	const todo = pass === 'same' ? rounds : unpaired.splice(0);
	for (const round of todo) {
		const candidates = posts
			.filter((p) => !usedPosts.has(p) && p.course === round.course)
			.map((p) => ({ post: p, gap: Math.abs(dayNumber(p.date) - dayNumber(round.date)) }))
			.filter(({ post, gap }) =>
				pass === 'same' ? gap === 0 : gap <= NEAR_DAYS && !playedThatDay.has(`${post.course} ${post.date}`),
			)
			.sort((a, b) => a.gap - b.gap);
		if (candidates.length > 0) {
			usedPosts.add(candidates[0].post);
			pairs.push({ round, post: candidates[0].post, gap: candidates[0].gap });
		} else {
			unpaired.push(round);
		}
	}
}

// Set the score in a post's frontmatter, replacing any existing score
function withScore(text, score) {
	if (/^score:.*$/m.test(text)) return text.replace(/^score:.*$/m, `score: ${score}`);
	return text.replace(/^(course:.*)$/m, `$1\nscore: ${score}`);
}

const updated = [], unchanged = [], created = [];
for (const { round, post, gap } of pairs) {
	if (post.score === String(round.strokes)) {
		unchanged.push(post.file);
		continue;
	}
	if (!dryRun) fs.writeFileSync(path.join(BLOG_DIR, post.file), withScore(post.text, round.strokes));
	const note = [post.score ? `was ${post.score}` : '', gap ? `Garmin round ${round.date}, ${gap} day(s) out` : '']
		.filter(Boolean)
		.join(', ');
	updated.push(`${post.file}: ${round.strokes}${note ? ` (${note})` : ''}`);
}

for (const round of unpaired) {
	let file = `${round.course}-${round.date}.md`;
	for (let n = 2; fs.existsSync(path.join(BLOG_DIR, file)) || created.some((c) => c.startsWith(file)); n++) {
		file = `${round.course}-${round.date}-${n}.md`;
	}
	const name = courses.get(round.course).name;
	const text = [
		'---',
		`title: ${JSON.stringify(name)}`,
		`description: ${JSON.stringify(round.course)}`,
		`pubDate: ${round.date}T00:00:00.000Z`,
		'type: round',
		`course: ${round.course}`,
		`score: ${round.strokes}`,
		'---',
		'',
	].join('\n');
	if (!dryRun) fs.writeFileSync(path.join(BLOG_DIR, file), text);
	created.push(`${file}: ${round.strokes}`);
}

// Par for each course. Garmin does not store it, but handicappedStrokes minus score is the par of the tees played.
// The most common value across a course's rounds is used. Only courses with no par (missing or 0) are filled in.
const parCounts = new Map(); // course id -> Map(par -> rounds)
for (const card of scorecards) {
	const course = GARMIN_COURSES[card.courseSnapshotId];
	const par = card.handicappedStrokes - card.score;
	if (card.holesCompleted !== 18 || !course || !Number.isInteger(par) || par < 54 || par > 80) continue;
	const counts = parCounts.get(course) ?? new Map();
	counts.set(par, (counts.get(par) ?? 0) + 1);
	parCounts.set(course, counts);
}
const coursesData = JSON.parse(fs.readFileSync(COURSES_FILE, 'utf8'));
const parsSet = [], parsDiffer = [];
for (const course of coursesData.courses) {
	const counts = parCounts.get(course.id);
	if (!counts) continue;
	const [garminPar] = [...counts].sort((a, b) => b[1] - a[1])[0];
	const mixed = counts.size > 1 ? ` (Garmin rounds had ${[...counts.keys()].join(' and ')})` : '';
	if (!course.par) {
		course.par = garminPar;
		parsSet.push(`${course.id}: ${garminPar}${mixed}`);
	} else if (course.par !== garminPar) {
		parsDiffer.push(`${course.id}: yours ${course.par}, Garmin ${garminPar}${mixed}`);
	}
}
if (!dryRun && parsSet.length > 0) fs.writeFileSync(COURSES_FILE, JSON.stringify(coursesData, null, 2) + '\n');

console.log(`${dryRun ? 'Dry run, nothing was changed.' : 'Done.'}\n`);
console.log(`Course pars ${dryRun ? 'to fill in' : 'filled in'}: ${parsSet.length}`);
parsSet.forEach((line) => console.log(`  + ${line}`));
if (parsDiffer.length) {
	console.log(`\nPar differs from Garmin, yours kept (Garmin's is for the tees you played):`);
	parsDiffer.forEach((line) => console.log(`  - ${line}`));
}
console.log('');
console.log(`Complete Garmin rounds: ${rounds.length}`);
console.log(`\nScores ${dryRun ? 'to fill in' : 'filled in'}: ${updated.length}`);
updated.forEach((line) => console.log(`  + ${line}`));
if (unchanged.length) console.log(`\nAlready had the right score: ${unchanged.length}`);
console.log(`\nNew posts${dryRun ? ' to create' : ''}: ${created.length}`);
created.forEach((line) => console.log(`  + ${line}`));
if (skipped.size) {
	console.log(`\nSkipped, course not in GARMIN_COURSES or courses.json:`);
	for (const [name, count] of skipped) console.log(`  - ${name}: ${count} round(s)`);
}
