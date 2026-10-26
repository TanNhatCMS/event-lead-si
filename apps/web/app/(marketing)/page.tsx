import { MarketingHome } from './_components/marketing-home';

/**
 * The page shell stays a server component so the route keeps prerendering; the
 * copy itself lives in a client component so it can switch language on the
 * client — see `_components/marketing-home.tsx` and `i18n/request.ts`.
 */
function Home() {
  return <MarketingHome />;
}

export default Home;
