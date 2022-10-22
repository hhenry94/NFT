let MetaApi = require('metaapi.cloud-sdk').default;

// Note: for information on how to use this example code please read https://metaapi.cloud/docs/client/usingCodeExamples
// It is recommended to create accounts with automatic broker settings detection instead,
// see metaApiSynchronizationExample.js

let token = process.env.TOKEN || '<eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiJlMjQyMzVjZDllNGVlYmNiYjFjNmRkOTEwOTMxMzYzMSIsInBlcm1pc3Npb25zIjpbXSwidG9rZW5JZCI6IjIwMjEwMjEzIiwiaWF0IjoxNjY2NDU0MTU4LCJyZWFsVXNlcklkIjoiZTI0MjM1Y2Q5ZTRlZWJjYmIxYzZkZDkxMDkzMTM2MzEifQ.PG_ocfHKGjREA26HwGGRv3jpwshBkiCOzZoc4s-swz-SbgNj2K6JOkn5A5l9Rw7cfctILbrIM6tMIQLNJ_4okWnQfdpoCz6H2oS6DAM4b9_2WBl4Dq9VJNrMEoLumb3Y-BzpaDtbp8VBBL9vXDca-fle-btqzbpNx4v3hf0BjY5NC_4_aMbXWtUmPQdkBGNzk0JWKC_XKMv-LHX2mpbu0Z0lnk4EJWqgPguvx9d6bKfWkJiFP6nTnE_NjR-PdQ6d1cjV3kjiVO4y79PWPqb8mLD81K5oxAHDJyUMxI_7KXl7srd3Q2utA988UIN1ZTtF1bPwztGgKQHrfS-d-6dz8JOumhMLtUIJKIfZaF72YQRLjq64Fv1U3Su9BX5gNPtw6j95zemr7QJzgu_NQp69NBoovoUcCOeS0ZBzS5N_YU2QAnYVGZn_gQnpISAVW6QgnLGUsdI8_ii0TP9gBGBmcf76LW0YjInOo7uzlFvWTz6kPwAZuIvNn6COnicZkPh3Gv1fauRMuEJ5UKm3W7bjpmOUQ5zjKdWlYIQm5_Qz3g2UPQ8__R-sCVBo5otE3w-zfzGNovoew5gK2FR1xRDfzDeG43RVeiAqJ__cOf_pogeMyCSe33o9ZDMkTv1SJ0RD5mUb2r0cLmUY97FL0J5ZcSc-gmJ7_60qcuVyAUC6S5o>';
let login = process.env.LOGIN || '<put in your MT login here>';
let password = process.env.PASSWORD || '<put in your MT password here>';
let serverName = process.env.SERVER || '<put in your MT server name here>';
let brokerSrvFile = process.env.PATH_TO_BROKER_SRV || '/path/to/your/broker.srv';

const api = new MetaApi(token);

async function testMetaApiSynchronization() {
  try {
    const profiles = await api.provisioningProfileApi.getProvisioningProfiles();

    // create test MetaTrader account profile
    let profile = profiles.find(p => p.name === serverName);
    if (!profile) {
      console.log('Creating account profile');
      profile = await api.provisioningProfileApi.createProvisioningProfile({
        name: serverName,
        version: 4,
        brokerTimezone: 'EET',
        brokerDSTSwitchTimezone: 'EET'
      });
      await profile.uploadFile('broker.srv', brokerSrvFile);
    }
    if (profile && profile.status === 'new') {
      console.log('Uploading broker.srv');
      await profile.uploadFile('broker.srv', brokerSrvFile);
    } else {
      console.log('Account profile already created');
    }

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
        provisioningProfileId: profile.id,
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
    console.log('history orders:', historyStorage.historyOrders.slice(-5));

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
    console.error(err);
  }
  process.exit();
}

testMetaApiSynchronization();
