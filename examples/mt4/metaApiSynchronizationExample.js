let MetaApi = require('metaapi.cloud-sdk').default;

// Note: for information on how to use this example code please read https://metaapi.cloud/docs/client/usingCodeExamples

let token = process.env.TOKEN || '<eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiJlMjQyMzVjZDllNGVlYmNiYjFjNmRkOTEwOTMxMzYzMSIsInBlcm1pc3Npb25zIjpbXSwidG9rZW5JZCI6IjIwMjEwMjEzIiwiaWF0IjoxNjY2NDUzNTMzLCJyZWFsVXNlcklkIjoiZTI0MjM1Y2Q5ZTRlZWJjYmIxYzZkZDkxMDkzMTM2MzEifQ.EZwTPhwrz9ycyatBSg6Ui4MLxC2QR4oYEyqvYVPjwRkyDzLBNb7-dlz6jSvL56ikVdWFnyrL_8CBuYWoY-inA09fMei6NM2vltBS-zaEascG8vKYeTdY89EvHZsuBGkhzGhwNzikJdxUnCu9Mi55C4A8ub--R5C9D0ZDvBCHdeU0Jw00ytUdcL7vrzaWKVJ6W3Zz_zL1Lr7DmuKyDqRmjDbYGbRGdVy0DMwKx9T-gpR43BpJI59xJsd6MNjNRjHrJnA-T5FgDCJKQpF6Z2qR-yDbqZ4tCzofH9Xq4yPq_E_tiY_A5dW-XQl1ycd9K_3m29WgE_g9el5q_APM0Nx4XRCYuJhjBQTdsIyu9EC0ft8QaeFvjAodoSeFc6N-mle6H2-CUNF0EPDDELlMURh68BePbIacYuD3ekD9Pw4XBtN9EO9RY461GOyPFc9bE3VPnyqJBuvIUvRAq1ahvcIl3HLrsKoTR55EVl0nT8vBfqIMXseNLmx8ZgFwH3t7Yp7M-DSAtGYG517kbp5uD8pKwPGtZGwJYYih_-hHQssJHzbnlERlNgYGM4qtX8b9wXye4NDCdnukKkLYzNK2laUhRk2J_owKLV8trsS_BED_EAwfyj_vT12D4eGAt-Pdjmm0Xj425QNfIskCkKuVeIS9heVsbnxDHA1XgBYQn7kNyV4>';
let login = process.env.LOGIN || '<put in your MT login here>';
let password = process.env.PASSWORD || '<put in your MT password here>';
let serverName = process.env.SERVER || '<put in your MT server name here>';

const api = new MetaApi(token);

async function testMetaApiSynchronization() {
  try {
    // Add test MetaTrader account
    let accounts = await api.metatraderAccountApi.getAccounts();
    let account = accounts.find(a => a.login === login && a.type.startsWith('cloud'));
    if (!account) {
      console.log('Adding MT4 account to MetaApi');
      account = await api.metatraderAccountApi.createAccount({
        name: 'Test account',
        type: 'cloud',
        login: login,
        password: password,
        server: serverName,
        platform: 'mt4',
        application: 'MetaApi',
        magic: 1000
      });
    } else {
      console.log('MT4 account already added to MetaApi');
    }

    // wait until account is deployed and connected to broker
    console.log('Deploying account');
    await account.deploy();
    console.log('Waiting for API server to connect to broker (may take couple of minutes)');
    await account.waitConnected();

    // connect to MetaApi API
    let connection = account.getStreamingConnection();
    await connection.connect();

    // wait until terminal state synchronized to the local state
    console.log('Waiting for SDK to synchronize to terminal state (may take some time depending on your history size)');
    await connection.waitSynchronized();

    // access local copy of terminal state
    console.log('Testing terminal state access');
    let terminalState = connection.terminalState;
    console.log('connected:', terminalState.connected);
    console.log('connected to broker:', terminalState.connectedToBroker);
    console.log('account information:', terminalState.accountInformation);
    console.log('positions:', terminalState.positions);
    console.log('orders:', terminalState.orders);
    console.log('specifications:', terminalState.specifications);
    console.log('EURUSD specification:', terminalState.specification('EURUSD'));
    await connection.subscribeToMarketData('EURUSD');
    console.log('EURUSD price:', terminalState.price('EURUSD'));

    // access history storage
    const historyStorage = connection.historyStorage;
    console.log('deals:', historyStorage.deals.slice(-5));
    console.log('deals with id=1:', historyStorage.getDealsByTicket(1));
    console.log('deals with positionId=1:', historyStorage.getDealsByPosition(1));
    console.log('deals for the last day:', historyStorage.getDealsByTimeRange(new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date()));
    console.log('history orders:', historyStorage.historyOrders.slice(-5));
    console.log('history orders with id=1:', historyStorage.getHistoryOrdersByTicket(1));
    console.log('history orders with positionId=1:', historyStorage.getHistoryOrdersByPosition(1));
    console.log('history orders for the last day:', historyStorage.getHistoryOrdersByTimeRange(
      new Date(Date.now() - 24 * 60 * 60 * 1000), new Date()));

    // calculate margin required for trade
    console.log('margin required for trade', await connection.calculateMargin({
      symbol: 'GBPUSD',
      type: 'ORDER_TYPE_BUY',
      volume: 0.1,
      openPrice: 1.1
    }));    

    // trade
    console.log('Submitting pending order');
    try {
      let result = await
      connection.createLimitBuyOrder('GBPUSD', 0.07, 1.0, 0.9, 2.0, {
        comment: 'comm',
        clientId: 'TE_GBPUSD_7hyINWqAlE'
      });
      console.log('Trade successful, result code is ' + result.stringCode);
    } catch (err) {
      console.log('Trade failed with result code ' + err.stringCode);
    }

    // finally, undeploy account after the test
    console.log('Undeploying MT4 account so that it does not consume any unwanted resources');
    await connection.close();
    await account.undeploy();
  } catch (err) {
    // process errors
    if(err.details) {
      // returned if the server file for the specified server name has not been found
      // recommended to check the server name or create the account using a provisioning profile
      if(err.details === 'E_SRV_NOT_FOUND') {
        console.error(err);
      // returned if the server has failed to connect to the broker using your credentials
      // recommended to check your login and password
      } else if (err.details === 'E_AUTH') {
        console.log(err);
      // returned if the server has failed to detect the broker settings
      // recommended to try again later or create the account using a provisioning profile
      } else if (err.details === 'E_SERVER_TIMEZONE') {
        console.log(err);
      }
    }
    console.error(err);
  }
  process.exit();
}

testMetaApiSynchronization();
