import AsyncApiComponent from '@asyncapi/react-component/browser'
import '@asyncapi/react-component/styles/default.min.css'
import specText from '../../asyncapi.yaml?raw'

const config = {
  publishLabel: 'Client → Server',
  subscribeLabel: 'Server → Client',
  sendLabel: 'Send',
  receiveLabel: 'Receive',
  requestLabel: 'Request',
  replyLabel: 'Reply'
}

function App() {
  return (
    <div style={{ height: '100vh' }}>
      <AsyncApiComponent schema={specText} config={config} />
    </div>
  )
}

export default App
