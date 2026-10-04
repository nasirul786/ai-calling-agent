import './globals.css';

export const metadata = {
  title: 'Partnex Support | AI Voice Assistant',
  description: 'Connect with Partnex AI Support team for software development queries & ticket assistance.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          async
          defer
        ></script>
      </head>
      <body>
        <div className="bg-ambient" />
        {children}
      </body>
    </html>
  );
}
