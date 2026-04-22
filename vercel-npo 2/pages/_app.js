import "../styles/globals.css";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Goodera · NPO Media Processor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Scrape NPO website images and discover social handles" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🌐%3C/text%3E%3C/svg%3E" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
