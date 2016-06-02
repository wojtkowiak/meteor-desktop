/**
 This is a slightly modified JS port of hot code push android client from here:
 https://github.com/meteor/cordova-plugin-meteor-webapp

 The MIT License (MIT)

 Copyright (c) 2015 Meteor Development Group

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.

 This is based on:
 /cordova-plugin-meteor-webapp/blob/master/src/android/AssetManifest.java

 */

var Log = require('./logger');
var assignIn = require('lodash/assignIn');

/**
 * Represents single file in the manifest.
 *
 * @param {object} manifestEntry
 * @param {string} manifestEntry.path
 * @param {string} manifestEntry.url
 * @param {string} manifestEntry.type
 * @param {number} manifestEntry.size
 * @param {bool}   manifestEntry.cacheable
 * @param {string} manifestEntry.hash
 * @param {string} manifestEntry.sourceMap
 * @param {string} manifestEntry.sourceMapUrl
 *
 * @property {string} filePath
 * @property {string} urlPath
 * @property {string} fileType
 * @property {number} size
 * @property {bool}   cacheable
 * @property {string} hash
 * @property {string} sourceMapFilePath
 * @property {string} sourceMapUrlPath
 * @constructor
 */
function ManifestEntry(manifestEntry) {
    assignIn(this, {
        filePath: manifestEntry.path,
        urlPath: manifestEntry.url,
        fileType: manifestEntry.type,
        size: manifestEntry.size,
        cacheable: manifestEntry.cacheable,
        hash: manifestEntry.hash || null,
        sourceMapFilePath: manifestEntry.sourceMap || null,
        sourceMapUrlPath: manifestEntry.sourceMapUrl || null
    });
}

/**
 * Represents a program.json app manifest.
 *
 * @param {Object} logger         - logger instance
 * @param {string} manifestSource - manifest source
 *
 * @property {string} version
 * @property {string} cordovaCompatibilityVersion
 *
 * @constructor
 */
function AssetManifest(logger, manifestSource) {
    var l = new Log('AssetManifest', logger);
    var json;
    var format;

    function error(msg) {
        l.log('error', msg);
        throw new Error(msg);
    }
    try {
        /**
         * @type object
         * @property {string} format
         * @property {string|null} version
         * @property {object} cordovaCompatibilityVersions
         * @property {string} cordovaCompatibilityVersions.android
         * @property {string} cordovaCompatibilityVersions.ios
         * @property {Array} manifest
         */
        json = JSON.parse(manifestSource);
        format = json.format || null;

        if (format !== null && format !== 'web-program-pre1') {
            error('The asset manifest format is incompatible: ' + format);
        }
        if (!('version' in json) || json.version === null) {
            error('Asset manifest does not have a version.');
        }

        this.version = json.version;

        // We are not using compatibility versions, but for sanity check this is ok.
        if (!('cordovaCompatibilityVersions' in json) || !('android' in json.cordovaCompatibilityVersions)) {
            error('Asset manifest does not have a cordovaCompatibilityVersion.');
        }

        this.cordovaCompatibilityVersion = json.cordovaCompatibilityVersions.android;

        this.entries = json.manifest.filter(
        /**
         * @param {object} manifestEntry
         * @param {string} manifestEntry.where
         * @returns {boolean}
         */
        function filterClientEntries(manifestEntry) {
            return !(manifestEntry.where !== 'client');
        }).map(function mapEntry(manifestEntry) {
            return new ManifestEntry(manifestEntry);
        });

        l.log('debug', this.entries.length + ' entries. (Version: ' + this.version + ' compVer: ' + this.cordovaCompatibilityVersion + ')');
    } catch (e) {
        error('Error parsing asset manifest: ' + e.message);
    }
}

module.exports = AssetManifest;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1vZHVsZXMvYXV0b3VwZGF0ZS9hc3NldE1hbmlmZXN0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUErQkEsSUFBSSxNQUFNLFFBQVEsVUFBUixDQUFWO0FBQ0EsSUFBSSxXQUFXLFFBQVEsaUJBQVIsQ0FBZjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXlCQSxTQUFTLGFBQVQsQ0FBdUIsYUFBdkIsRUFBc0M7QUFDbEMsYUFBUyxJQUFULEVBQWU7QUFDWCxrQkFBVSxjQUFjLElBRGI7QUFFWCxpQkFBUyxjQUFjLEdBRlo7QUFHWCxrQkFBVSxjQUFjLElBSGI7QUFJWCxjQUFNLGNBQWMsSUFKVDtBQUtYLG1CQUFXLGNBQWMsU0FMZDtBQU1YLGNBQU0sY0FBYyxJQUFkLElBQXNCLElBTmpCO0FBT1gsMkJBQW1CLGNBQWMsU0FBZCxJQUEyQixJQVBuQztBQVFYLDBCQUFrQixjQUFjLFlBQWQsSUFBOEI7QUFSckMsS0FBZjtBQVVIOzs7Ozs7Ozs7Ozs7O0FBYUQsU0FBUyxhQUFULENBQXVCLE1BQXZCLEVBQStCLGNBQS9CLEVBQStDO0FBQzNDLFFBQUksSUFBSSxJQUFJLEdBQUosQ0FBUSxlQUFSLEVBQXlCLE1BQXpCLENBQVI7QUFDQSxRQUFJLElBQUo7QUFDQSxRQUFJLE1BQUo7O0FBRUEsYUFBUyxLQUFULENBQWUsR0FBZixFQUFvQjtBQUNoQixVQUFFLEdBQUYsQ0FBTSxPQUFOLEVBQWUsR0FBZjtBQUNBLGNBQU0sSUFBSSxLQUFKLENBQVUsR0FBVixDQUFOO0FBQ0g7QUFDRCxRQUFJOzs7Ozs7Ozs7O0FBVUEsZUFBTyxLQUFLLEtBQUwsQ0FBVyxjQUFYLENBQVA7QUFDQSxpQkFBUyxLQUFLLE1BQUwsSUFBZSxJQUF4Qjs7QUFFQSxZQUFJLFdBQVcsSUFBWCxJQUFtQixXQUFXLGtCQUFsQyxFQUFzRDtBQUNsRCxrQkFBTSxnREFBZ0QsTUFBdEQ7QUFDSDtBQUNELFlBQUksRUFBRSxhQUFhLElBQWYsS0FBd0IsS0FBSyxPQUFMLEtBQWlCLElBQTdDLEVBQW1EO0FBQy9DLGtCQUFNLHlDQUFOO0FBQ0g7O0FBRUQsYUFBSyxPQUFMLEdBQWUsS0FBSyxPQUFwQjs7O0FBR0EsWUFBSSxFQUFFLGtDQUFrQyxJQUFwQyxLQUNBLEVBQUUsYUFBYSxLQUFLLDRCQUFwQixDQURKLEVBQ3VEO0FBQ25ELGtCQUFNLDZEQUFOO0FBQ0g7O0FBRUQsYUFBSywyQkFBTCxHQUFtQyxLQUFLLDRCQUFMLENBQWtDLE9BQXJFOztBQUVBLGFBQUssT0FBTCxHQUFlLEtBQUssUUFBTCxDQUFjLE1BQWQ7Ozs7OztBQU1YLGlCQUFTLG1CQUFULENBQTZCLGFBQTdCLEVBQTRDO0FBQ3hDLG1CQUFPLEVBQUUsY0FBYyxLQUFkLEtBQXdCLFFBQTFCLENBQVA7QUFDSCxTQVJVLEVBU04sR0FUTSxDQVNGLFNBQVMsUUFBVCxDQUFrQixhQUFsQixFQUFpQztBQUNsQyxtQkFBTyxJQUFJLGFBQUosQ0FBa0IsYUFBbEIsQ0FBUDtBQUNILFNBWE0sQ0FBZjs7QUFhQSxVQUFFLEdBQUYsQ0FBTSxPQUFOLEVBQWUsS0FBSyxPQUFMLENBQWEsTUFBYixHQUFzQixzQkFBdEIsR0FBK0MsS0FBSyxPQUFwRCxHQUE4RCxZQUE5RCxHQUNULEtBQUssMkJBREksR0FDMEIsR0FEekM7QUFFSCxLQTdDRCxDQTZDRSxPQUFPLENBQVAsRUFBVTtBQUNSLGNBQU0sbUNBQW1DLEVBQUUsT0FBM0M7QUFDSDtBQUNKOztBQUVELE9BQU8sT0FBUCxHQUFpQixhQUFqQiIsImZpbGUiOiJtb2R1bGVzL2F1dG91cGRhdGUvYXNzZXRNYW5pZmVzdC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gVGhpcyBpcyBhIHNsaWdodGx5IG1vZGlmaWVkIEpTIHBvcnQgb2YgaG90IGNvZGUgcHVzaCBhbmRyb2lkIGNsaWVudCBmcm9tIGhlcmU6XHJcbiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL2NvcmRvdmEtcGx1Z2luLW1ldGVvci13ZWJhcHBcclxuXHJcbiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcclxuXHJcbiBDb3B5cmlnaHQgKGMpIDIwMTUgTWV0ZW9yIERldmVsb3BtZW50IEdyb3VwXHJcblxyXG4gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxyXG4gb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxyXG4gaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xyXG4gdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxyXG4gY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXHJcbiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxyXG5cclxuIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxyXG4gY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cclxuXHJcbiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXHJcbiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcclxuIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxyXG4gQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxyXG4gTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcclxuIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXHJcbiBTT0ZUV0FSRS5cclxuXHJcbiBUaGlzIGlzIGJhc2VkIG9uOlxyXG4gL2NvcmRvdmEtcGx1Z2luLW1ldGVvci13ZWJhcHAvYmxvYi9tYXN0ZXIvc3JjL2FuZHJvaWQvQXNzZXRNYW5pZmVzdC5qYXZhXHJcblxyXG4gKi9cclxuXHJcbnZhciBMb2cgPSByZXF1aXJlKCcuL2xvZ2dlcicpO1xyXG52YXIgYXNzaWduSW4gPSByZXF1aXJlKCdsb2Rhc2gvYXNzaWduSW4nKTtcclxuXHJcbi8qKlxyXG4gKiBSZXByZXNlbnRzIHNpbmdsZSBmaWxlIGluIHRoZSBtYW5pZmVzdC5cclxuICpcclxuICogQHBhcmFtIHtvYmplY3R9IG1hbmlmZXN0RW50cnlcclxuICogQHBhcmFtIHtzdHJpbmd9IG1hbmlmZXN0RW50cnkucGF0aFxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbWFuaWZlc3RFbnRyeS51cmxcclxuICogQHBhcmFtIHtzdHJpbmd9IG1hbmlmZXN0RW50cnkudHlwZVxyXG4gKiBAcGFyYW0ge251bWJlcn0gbWFuaWZlc3RFbnRyeS5zaXplXHJcbiAqIEBwYXJhbSB7Ym9vbH0gICBtYW5pZmVzdEVudHJ5LmNhY2hlYWJsZVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbWFuaWZlc3RFbnRyeS5oYXNoXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBtYW5pZmVzdEVudHJ5LnNvdXJjZU1hcFxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbWFuaWZlc3RFbnRyeS5zb3VyY2VNYXBVcmxcclxuICpcclxuICogQHByb3BlcnR5IHtzdHJpbmd9IGZpbGVQYXRoXHJcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSB1cmxQYXRoXHJcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBmaWxlVHlwZVxyXG4gKiBAcHJvcGVydHkge251bWJlcn0gc2l6ZVxyXG4gKiBAcHJvcGVydHkge2Jvb2x9ICAgY2FjaGVhYmxlXHJcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBoYXNoXHJcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBzb3VyY2VNYXBGaWxlUGF0aFxyXG4gKiBAcHJvcGVydHkge3N0cmluZ30gc291cmNlTWFwVXJsUGF0aFxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbmZ1bmN0aW9uIE1hbmlmZXN0RW50cnkobWFuaWZlc3RFbnRyeSkge1xyXG4gICAgYXNzaWduSW4odGhpcywge1xyXG4gICAgICAgIGZpbGVQYXRoOiBtYW5pZmVzdEVudHJ5LnBhdGgsXHJcbiAgICAgICAgdXJsUGF0aDogbWFuaWZlc3RFbnRyeS51cmwsXHJcbiAgICAgICAgZmlsZVR5cGU6IG1hbmlmZXN0RW50cnkudHlwZSxcclxuICAgICAgICBzaXplOiBtYW5pZmVzdEVudHJ5LnNpemUsXHJcbiAgICAgICAgY2FjaGVhYmxlOiBtYW5pZmVzdEVudHJ5LmNhY2hlYWJsZSxcclxuICAgICAgICBoYXNoOiBtYW5pZmVzdEVudHJ5Lmhhc2ggfHwgbnVsbCxcclxuICAgICAgICBzb3VyY2VNYXBGaWxlUGF0aDogbWFuaWZlc3RFbnRyeS5zb3VyY2VNYXAgfHwgbnVsbCxcclxuICAgICAgICBzb3VyY2VNYXBVcmxQYXRoOiBtYW5pZmVzdEVudHJ5LnNvdXJjZU1hcFVybCB8fCBudWxsXHJcbiAgICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgYSBwcm9ncmFtLmpzb24gYXBwIG1hbmlmZXN0LlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gbG9nZ2VyICAgICAgICAgLSBsb2dnZXIgaW5zdGFuY2VcclxuICogQHBhcmFtIHtzdHJpbmd9IG1hbmlmZXN0U291cmNlIC0gbWFuaWZlc3Qgc291cmNlXHJcbiAqXHJcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSB2ZXJzaW9uXHJcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBjb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25cclxuICpcclxuICogQGNvbnN0cnVjdG9yXHJcbiAqL1xyXG5mdW5jdGlvbiBBc3NldE1hbmlmZXN0KGxvZ2dlciwgbWFuaWZlc3RTb3VyY2UpIHtcclxuICAgIHZhciBsID0gbmV3IExvZygnQXNzZXRNYW5pZmVzdCcsIGxvZ2dlcik7XHJcbiAgICB2YXIganNvbjtcclxuICAgIHZhciBmb3JtYXQ7XHJcblxyXG4gICAgZnVuY3Rpb24gZXJyb3IobXNnKSB7XHJcbiAgICAgICAgbC5sb2coJ2Vycm9yJywgbXNnKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgICogQHR5cGUgb2JqZWN0XHJcbiAgICAgICAgICogQHByb3BlcnR5IHtzdHJpbmd9IGZvcm1hdFxyXG4gICAgICAgICAqIEBwcm9wZXJ0eSB7c3RyaW5nfG51bGx9IHZlcnNpb25cclxuICAgICAgICAgKiBAcHJvcGVydHkge29iamVjdH0gY29yZG92YUNvbXBhdGliaWxpdHlWZXJzaW9uc1xyXG4gICAgICAgICAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBjb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb25zLmFuZHJvaWRcclxuICAgICAgICAgKiBAcHJvcGVydHkge3N0cmluZ30gY29yZG92YUNvbXBhdGliaWxpdHlWZXJzaW9ucy5pb3NcclxuICAgICAgICAgKiBAcHJvcGVydHkge0FycmF5fSBtYW5pZmVzdFxyXG4gICAgICAgICAqL1xyXG4gICAgICAgIGpzb24gPSBKU09OLnBhcnNlKG1hbmlmZXN0U291cmNlKTtcclxuICAgICAgICBmb3JtYXQgPSBqc29uLmZvcm1hdCB8fCBudWxsO1xyXG5cclxuICAgICAgICBpZiAoZm9ybWF0ICE9PSBudWxsICYmIGZvcm1hdCAhPT0gJ3dlYi1wcm9ncmFtLXByZTEnKSB7XHJcbiAgICAgICAgICAgIGVycm9yKCdUaGUgYXNzZXQgbWFuaWZlc3QgZm9ybWF0IGlzIGluY29tcGF0aWJsZTogJyArIGZvcm1hdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICghKCd2ZXJzaW9uJyBpbiBqc29uKSB8fCBqc29uLnZlcnNpb24gPT09IG51bGwpIHtcclxuICAgICAgICAgICAgZXJyb3IoJ0Fzc2V0IG1hbmlmZXN0IGRvZXMgbm90IGhhdmUgYSB2ZXJzaW9uLicpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy52ZXJzaW9uID0ganNvbi52ZXJzaW9uO1xyXG5cclxuICAgICAgICAvLyBXZSBhcmUgbm90IHVzaW5nIGNvbXBhdGliaWxpdHkgdmVyc2lvbnMsIGJ1dCBmb3Igc2FuaXR5IGNoZWNrIHRoaXMgaXMgb2suXHJcbiAgICAgICAgaWYgKCEoJ2NvcmRvdmFDb21wYXRpYmlsaXR5VmVyc2lvbnMnIGluIGpzb24pIHx8XHJcbiAgICAgICAgICAgICEoJ2FuZHJvaWQnIGluIGpzb24uY29yZG92YUNvbXBhdGliaWxpdHlWZXJzaW9ucykpIHtcclxuICAgICAgICAgICAgZXJyb3IoJ0Fzc2V0IG1hbmlmZXN0IGRvZXMgbm90IGhhdmUgYSBjb3Jkb3ZhQ29tcGF0aWJpbGl0eVZlcnNpb24uJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmNvcmRvdmFDb21wYXRpYmlsaXR5VmVyc2lvbiA9IGpzb24uY29yZG92YUNvbXBhdGliaWxpdHlWZXJzaW9ucy5hbmRyb2lkO1xyXG5cclxuICAgICAgICB0aGlzLmVudHJpZXMgPSBqc29uLm1hbmlmZXN0LmZpbHRlcihcclxuICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBtYW5pZmVzdEVudHJ5XHJcbiAgICAgICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtYW5pZmVzdEVudHJ5LndoZXJlXHJcbiAgICAgICAgICAgICAqIEByZXR1cm5zIHtib29sZWFufVxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgZnVuY3Rpb24gZmlsdGVyQ2xpZW50RW50cmllcyhtYW5pZmVzdEVudHJ5KSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gIShtYW5pZmVzdEVudHJ5LndoZXJlICE9PSAnY2xpZW50Jyk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAubWFwKGZ1bmN0aW9uIG1hcEVudHJ5KG1hbmlmZXN0RW50cnkpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IE1hbmlmZXN0RW50cnkobWFuaWZlc3RFbnRyeSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbC5sb2coJ2RlYnVnJywgdGhpcy5lbnRyaWVzLmxlbmd0aCArICcgZW50cmllcy4gKFZlcnNpb246ICcgKyB0aGlzLnZlcnNpb24gKyAnIGNvbXBWZXI6ICdcclxuICAgICAgICAgICAgKyB0aGlzLmNvcmRvdmFDb21wYXRpYmlsaXR5VmVyc2lvbiArICcpJyk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgZXJyb3IoJ0Vycm9yIHBhcnNpbmcgYXNzZXQgbWFuaWZlc3Q6ICcgKyBlLm1lc3NhZ2UpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFzc2V0TWFuaWZlc3Q7XHJcbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
