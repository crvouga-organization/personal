/** homelab modules load the fleet configuration when imported. Import this
 * first in every entry point so they read this checkout's fleet.json unless
 * HOMELAB_CONFIG already names one.
 */
import { join } from 'node:path';

process.env['HOMELAB_CONFIG'] ??= join(import.meta.dir, '../../../fleet.json');
