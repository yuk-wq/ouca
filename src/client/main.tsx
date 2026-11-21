import { render } from 'preact';
import { APP_VERSION, formatVersionLabel } from '../shared/version';

function App() {
  return (
    <main>
      <h1>OUCA</h1>
      <p>{formatVersionLabel(APP_VERSION)}</p>
    </main>
  );
}

render(<App />, document.getElementById('app')!);
