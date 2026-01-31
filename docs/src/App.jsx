import AsyncApiComponent from '@asyncapi/react-component/browser'
import '@asyncapi/react-component/styles/default.min.css'
import specText from '../../asyncapi.yaml?raw'

function App() {
  return (
    <div style={{ height: '100vh' }}>
      <AsyncApiComponent schema={specText} />
    </div>
  )
}

export default App
