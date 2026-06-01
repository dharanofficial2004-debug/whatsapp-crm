import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

  async function run() {
    try {
      const { data, error } = await supabase.rpc('get_table_info', { table_name: 'automation_logs' })
      console.log(data || error)
    } catch (e) {
      console.error('RPC error:', e)
    }
  }

  run();
