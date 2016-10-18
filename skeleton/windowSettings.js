/* eslint-disable no-param-reassign */

import { join } from 'path';
import assignIn from 'lodash/assignIn';

export default class WindowSettings {
    /**
     * Merges window dev settings.
     */
    static mergeWindowDevSettings(settings) {
        if ('windowDev' in settings) {
            assignIn(settings.window, settings.windowDev);
        }
    }

    /**
     * Merges window settings specific to current os.
     */
    static mergeOsSpecificWindowSettings(settings, os) {
        ['windows', 'linux', 'osx'].forEach((system) => {
            if (
                os[`is${system[0].toUpperCase()}${system.substring(1)}`] &&
                (`_${system}`) in settings.window
            ) {
                assignIn(settings.window, settings.window[`_${system}`]);
            }
        });
    }

    /**
     * Applies variables to window settings. Supported:
     * `@assets` - prefixes paths with current assets path
     *
     * @param {Object} windowSettings - Window settings from settings.json
     */
    static applyVars(windowSettings, desktopPath) {
        Object.keys(windowSettings).forEach((key) => {
            if (key[0] !== '_') {
                if (typeof windowSettings[key] === 'object') {
                    this.applyVars(windowSettings[key]);
                } else if (typeof windowSettings[key] === 'string') {
                    if (~windowSettings[key].indexOf('@assets')) {
                        windowSettings[key] = join(
                            desktopPath,
                            'assets',
                            windowSettings[key].replace(/@assets\//gmi, '')
                        );
                    }
                }
            }
        });
    }
}
