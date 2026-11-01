import { LATEST_BANNER, LATEST_FACTS, LATEST_INTRO, LATEST_TITLE, NOT_MEASURED, RECHECK_STEPS, RELEASE_DATE, RELEASE_TABLE, SINCE_ROWS } from './latestData.js';

export const buildLatestStory = () => ({
  title: LATEST_TITLE, intro: LATEST_INTRO, banner: LATEST_BANNER, releaseDate: RELEASE_DATE,
  facts: LATEST_FACTS, table: RELEASE_TABLE, since: SINCE_ROWS, notMeasured: NOT_MEASURED, recheck: RECHECK_STEPS,
});
