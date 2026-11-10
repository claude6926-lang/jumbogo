import {spawnSync} from 'node:child_process';
// Compilation must not mutate the local database or the live cloud database.
const env={...process.env,DATABASE_PATH:':memory:',DEMO_MODE:'false',ENABLE_DEMO_LOGIN:'false',JUMBO_BUILD:'1',TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:''};
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env});
process.exit(result.status??1);
