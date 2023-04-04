"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _runtime = _interopRequireDefault(require("regenerator-runtime/runtime"));

var _fs = _interopRequireDefault(require("fs"));

var _crossSpawn = _interopRequireDefault(require("cross-spawn"));

var _log = _interopRequireDefault(require("./log"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// eslint-disable-next-line no-unused-vars

/**
 * Utility class designed for managing Meteor packages.
 *
 * @property {MeteorDesktop} $
 * @class
 */
class MeteorManager {
  /**
   * @param {MeteorDesktop} $ - context
   * @constructor
   */
  constructor($) {
    this.log = new _log.default('meteorManager');
    this.$ = $;
  }
  /**
   * Looks for specified packages in .meteor/packages. In other words checks if the project has
   * specified packages added.
   * @param {Array} packages
   * @returns {boolean}
   */


  checkPackages(packages) {
    const usedPackages = _fs.default.readFileSync(this.$.env.paths.meteorApp.packages, 'UTF-8').replace(/\r/gm, '').split('\n').filter(line => !line.trim().startsWith('#'));

    return !packages.some(packageToFind => !usedPackages.some(meteorPackage => ~meteorPackage.indexOf(packageToFind)));
  }
  /**
   * Looks for specified packages in .meteor/packages. In other words checks if the project has
   * specified packages added.
   * @param {Array} packages
   * @returns {boolean}
   */


  checkPackagesVersion(packages) {
    const usedPackages = _fs.default.readFileSync(this.$.env.paths.meteorApp.versions, 'UTF-8').replace(/\r/gm, '').split('\n');

    return !packages.some(packageToFind => !usedPackages.some(meteorPackage => meteorPackage === packageToFind));
  }
  /**
   * Ensures certain packages are added to meteor project and in correct version.
   * @param {Array} packages
   * @param {Array} packagesWithVersion
   * @param {string} who - name of the entity that requests presence of thos packages (can be the
   *                       integration itself or a plugin)
   * @returns {Promise.<void>}
   */


  async ensurePackages(packages, packagesWithVersion, who) {
    if (!this.checkPackages(packages)) {
      this.log.warn(`${who} requires some packages that are not added to project, will try to add them now`);

      try {
        await this.addPackages(packages, packagesWithVersion);
      } catch (e) {
        throw new Error(e);
      }
    }

    if (!this.checkPackagesVersion(packagesWithVersion)) {
      this.log.warn(`${who} required packages version is different, fixing it`);

      try {
        await this.addPackages(packages, packagesWithVersion);
      } catch (e) {
        throw new Error(e);
      }
    }
  }
  /**
   * Removes packages from the meteor app.
   * @param {Array} packages            - array with names of the packages to remove
   */


  deletePackages(packages) {
    this.log.warn('removing packages from meteor project', ...packages);
    return new Promise((resolve, reject) => {
      (0, _crossSpawn.default)('meteor', ['remove'].concat(packages), {
        cwd: this.$.env.paths.meteorApp.root,
        stdio: ['pipe', 'pipe', process.stderr],
        env: Object.assign({
          METEOR_PRETTY_OUTPUT: 0,
          METEOR_NO_RELEASE_CHECK: 1
        }, process.env)
      }).on('exit', code => {
        if (code !== 0 || this.checkPackages(packages)) {
          reject('removing packages failed');
        } else {
          resolve();
        }
      });
    });
  }
  /**
   * Adds packages to the meteor app.
   * @param {Array} packages            - array with names of the packages to add
   * @param {Array} packagesWithVersion - array with names and versions of the packages to add
   */


  addPackages(packages, packagesWithVersion) {
    this.log.info('adding packages to meteor project', ...packagesWithVersion);
    return new Promise((resolve, reject) => {
      (0, _crossSpawn.default)('meteor', ['add'].concat(packagesWithVersion.map(packageName => packageName.replace('@', '@='))), {
        cwd: this.$.env.paths.meteorApp.root,
        stdio: ['pipe', 'pipe', process.stderr],
        env: Object.assign({
          METEOR_PRETTY_OUTPUT: 0,
          METEOR_NO_RELEASE_CHECK: 1
        }, process.env)
      }).on('exit', code => {
        if (code !== 0 || !this.checkPackages(packages)) {
          reject('adding packages failed');
        } else {
          resolve();
        }
      });
    });
  }

}

exports.default = MeteorManager;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJNZXRlb3JNYW5hZ2VyIiwiY29uc3RydWN0b3IiLCIkIiwibG9nIiwiTG9nIiwiY2hlY2tQYWNrYWdlcyIsInBhY2thZ2VzIiwidXNlZFBhY2thZ2VzIiwiZnMiLCJyZWFkRmlsZVN5bmMiLCJlbnYiLCJwYXRocyIsIm1ldGVvckFwcCIsInJlcGxhY2UiLCJzcGxpdCIsImZpbHRlciIsImxpbmUiLCJ0cmltIiwic3RhcnRzV2l0aCIsInNvbWUiLCJwYWNrYWdlVG9GaW5kIiwibWV0ZW9yUGFja2FnZSIsImluZGV4T2YiLCJjaGVja1BhY2thZ2VzVmVyc2lvbiIsInZlcnNpb25zIiwiZW5zdXJlUGFja2FnZXMiLCJwYWNrYWdlc1dpdGhWZXJzaW9uIiwid2hvIiwid2FybiIsImFkZFBhY2thZ2VzIiwiZSIsIkVycm9yIiwiZGVsZXRlUGFja2FnZXMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsInNwYXduIiwiY29uY2F0IiwiY3dkIiwicm9vdCIsInN0ZGlvIiwicHJvY2VzcyIsInN0ZGVyciIsIk9iamVjdCIsImFzc2lnbiIsIk1FVEVPUl9QUkVUVFlfT1VUUFVUIiwiTUVURU9SX05PX1JFTEVBU0VfQ0hFQ0siLCJvbiIsImNvZGUiLCJpbmZvIiwibWFwIiwicGFja2FnZU5hbWUiXSwic291cmNlcyI6WyIuLi9saWIvbWV0ZW9yTWFuYWdlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdW51c2VkLXZhcnNcbmltcG9ydCByZWdlbmVyYXRvclJ1bnRpbWUgZnJvbSAncmVnZW5lcmF0b3ItcnVudGltZS9ydW50aW1lJztcbmltcG9ydCBmcyBmcm9tICdmcyc7XG5pbXBvcnQgc3Bhd24gZnJvbSAnY3Jvc3Mtc3Bhd24nO1xuXG5pbXBvcnQgTG9nIGZyb20gJy4vbG9nJztcblxuLyoqXG4gKiBVdGlsaXR5IGNsYXNzIGRlc2lnbmVkIGZvciBtYW5hZ2luZyBNZXRlb3IgcGFja2FnZXMuXG4gKlxuICogQHByb3BlcnR5IHtNZXRlb3JEZXNrdG9wfSAkXG4gKiBAY2xhc3NcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWV0ZW9yTWFuYWdlciB7XG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtNZXRlb3JEZXNrdG9wfSAkIC0gY29udGV4dFxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKCQpIHtcbiAgICAgICAgdGhpcy5sb2cgPSBuZXcgTG9nKCdtZXRlb3JNYW5hZ2VyJyk7XG4gICAgICAgIHRoaXMuJCA9ICQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTG9va3MgZm9yIHNwZWNpZmllZCBwYWNrYWdlcyBpbiAubWV0ZW9yL3BhY2thZ2VzLiBJbiBvdGhlciB3b3JkcyBjaGVja3MgaWYgdGhlIHByb2plY3QgaGFzXG4gICAgICogc3BlY2lmaWVkIHBhY2thZ2VzIGFkZGVkLlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IHBhY2thZ2VzXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICovXG4gICAgY2hlY2tQYWNrYWdlcyhwYWNrYWdlcykge1xuICAgICAgICBjb25zdCB1c2VkUGFja2FnZXMgPSBmc1xuICAgICAgICAgICAgLnJlYWRGaWxlU3luYyh0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5wYWNrYWdlcywgJ1VURi04JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZ20sICcnKVxuICAgICAgICAgICAgLnNwbGl0KCdcXG4nKVxuICAgICAgICAgICAgLmZpbHRlcihsaW5lID0+ICFsaW5lLnRyaW0oKS5zdGFydHNXaXRoKCcjJykpO1xuICAgICAgICByZXR1cm4gIXBhY2thZ2VzLnNvbWUoXG4gICAgICAgICAgICBwYWNrYWdlVG9GaW5kID0+XG4gICAgICAgICAgICAgICAgIXVzZWRQYWNrYWdlcy5zb21lKG1ldGVvclBhY2thZ2UgPT4gfm1ldGVvclBhY2thZ2UuaW5kZXhPZihwYWNrYWdlVG9GaW5kKSlcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMb29rcyBmb3Igc3BlY2lmaWVkIHBhY2thZ2VzIGluIC5tZXRlb3IvcGFja2FnZXMuIEluIG90aGVyIHdvcmRzIGNoZWNrcyBpZiB0aGUgcHJvamVjdCBoYXNcbiAgICAgKiBzcGVjaWZpZWQgcGFja2FnZXMgYWRkZWQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gcGFja2FnZXNcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBjaGVja1BhY2thZ2VzVmVyc2lvbihwYWNrYWdlcykge1xuICAgICAgICBjb25zdCB1c2VkUGFja2FnZXMgPSBmcy5yZWFkRmlsZVN5bmModGhpcy4kLmVudi5wYXRocy5tZXRlb3JBcHAudmVyc2lvbnMsICdVVEYtOCcpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxyL2dtLCAnJylcbiAgICAgICAgICAgIC5zcGxpdCgnXFxuJyk7XG4gICAgICAgIHJldHVybiAhcGFja2FnZXMuc29tZShcbiAgICAgICAgICAgIHBhY2thZ2VUb0ZpbmQgPT4gIXVzZWRQYWNrYWdlcy5zb21lKG1ldGVvclBhY2thZ2UgPT4gbWV0ZW9yUGFja2FnZSA9PT0gcGFja2FnZVRvRmluZClcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbnN1cmVzIGNlcnRhaW4gcGFja2FnZXMgYXJlIGFkZGVkIHRvIG1ldGVvciBwcm9qZWN0IGFuZCBpbiBjb3JyZWN0IHZlcnNpb24uXG4gICAgICogQHBhcmFtIHtBcnJheX0gcGFja2FnZXNcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBwYWNrYWdlc1dpdGhWZXJzaW9uXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHdobyAtIG5hbWUgb2YgdGhlIGVudGl0eSB0aGF0IHJlcXVlc3RzIHByZXNlbmNlIG9mIHRob3MgcGFja2FnZXMgKGNhbiBiZSB0aGVcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgaW50ZWdyYXRpb24gaXRzZWxmIG9yIGEgcGx1Z2luKVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlLjx2b2lkPn1cbiAgICAgKi9cbiAgICBhc3luYyBlbnN1cmVQYWNrYWdlcyhwYWNrYWdlcywgcGFja2FnZXNXaXRoVmVyc2lvbiwgd2hvKSB7XG4gICAgICAgIGlmICghdGhpcy5jaGVja1BhY2thZ2VzKHBhY2thZ2VzKSkge1xuICAgICAgICAgICAgdGhpcy5sb2cud2FybihgJHt3aG99IHJlcXVpcmVzIHNvbWUgcGFja2FnZXMgdGhhdCBhcmUgbm90IGFkZGVkIHRvIHByb2plY3QsIHdpbGwgdHJ5IHRvIGFkZCB0aGVtIG5vd2ApO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFkZFBhY2thZ2VzKHBhY2thZ2VzLCBwYWNrYWdlc1dpdGhWZXJzaW9uKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLmNoZWNrUGFja2FnZXNWZXJzaW9uKHBhY2thZ2VzV2l0aFZlcnNpb24pKSB7XG4gICAgICAgICAgICB0aGlzLmxvZy53YXJuKGAke3dob30gcmVxdWlyZWQgcGFja2FnZXMgdmVyc2lvbiBpcyBkaWZmZXJlbnQsIGZpeGluZyBpdGApO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFkZFBhY2thZ2VzKHBhY2thZ2VzLCBwYWNrYWdlc1dpdGhWZXJzaW9uKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHBhY2thZ2VzIGZyb20gdGhlIG1ldGVvciBhcHAuXG4gICAgICogQHBhcmFtIHtBcnJheX0gcGFja2FnZXMgICAgICAgICAgICAtIGFycmF5IHdpdGggbmFtZXMgb2YgdGhlIHBhY2thZ2VzIHRvIHJlbW92ZVxuICAgICAqL1xuICAgIGRlbGV0ZVBhY2thZ2VzKHBhY2thZ2VzKSB7XG4gICAgICAgIHRoaXMubG9nLndhcm4oJ3JlbW92aW5nIHBhY2thZ2VzIGZyb20gbWV0ZW9yIHByb2plY3QnLCAuLi5wYWNrYWdlcyk7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBzcGF3bihcbiAgICAgICAgICAgICAgICAnbWV0ZW9yJyxcbiAgICAgICAgICAgICAgICBbJ3JlbW92ZSddLmNvbmNhdChwYWNrYWdlcyksIHtcbiAgICAgICAgICAgICAgICAgICAgY3dkOiB0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5yb290LFxuICAgICAgICAgICAgICAgICAgICBzdGRpbzogWydwaXBlJywgJ3BpcGUnLCBwcm9jZXNzLnN0ZGVycl0sXG4gICAgICAgICAgICAgICAgICAgIGVudjogT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgTUVURU9SX1BSRVRUWV9PVVRQVVQ6IDAsIE1FVEVPUl9OT19SRUxFQVNFX0NIRUNLOiAxIH0sIHByb2Nlc3MuZW52XG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApLm9uKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoY29kZSAhPT0gMCB8fCB0aGlzLmNoZWNrUGFja2FnZXMocGFja2FnZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdCgncmVtb3ZpbmcgcGFja2FnZXMgZmFpbGVkJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHBhY2thZ2VzIHRvIHRoZSBtZXRlb3IgYXBwLlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IHBhY2thZ2VzICAgICAgICAgICAgLSBhcnJheSB3aXRoIG5hbWVzIG9mIHRoZSBwYWNrYWdlcyB0byBhZGRcbiAgICAgKiBAcGFyYW0ge0FycmF5fSBwYWNrYWdlc1dpdGhWZXJzaW9uIC0gYXJyYXkgd2l0aCBuYW1lcyBhbmQgdmVyc2lvbnMgb2YgdGhlIHBhY2thZ2VzIHRvIGFkZFxuICAgICAqL1xuICAgIGFkZFBhY2thZ2VzKHBhY2thZ2VzLCBwYWNrYWdlc1dpdGhWZXJzaW9uKSB7XG4gICAgICAgIHRoaXMubG9nLmluZm8oJ2FkZGluZyBwYWNrYWdlcyB0byBtZXRlb3IgcHJvamVjdCcsIC4uLnBhY2thZ2VzV2l0aFZlcnNpb24pO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgc3Bhd24oXG4gICAgICAgICAgICAgICAgJ21ldGVvcicsXG4gICAgICAgICAgICAgICAgWydhZGQnXS5jb25jYXQoXG4gICAgICAgICAgICAgICAgICAgIHBhY2thZ2VzV2l0aFZlcnNpb24ubWFwKHBhY2thZ2VOYW1lID0+IHBhY2thZ2VOYW1lLnJlcGxhY2UoJ0AnLCAnQD0nKSlcbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgY3dkOiB0aGlzLiQuZW52LnBhdGhzLm1ldGVvckFwcC5yb290LFxuICAgICAgICAgICAgICAgICAgICBzdGRpbzogWydwaXBlJywgJ3BpcGUnLCBwcm9jZXNzLnN0ZGVycl0sXG4gICAgICAgICAgICAgICAgICAgIGVudjogT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgTUVURU9SX1BSRVRUWV9PVVRQVVQ6IDAsIE1FVEVPUl9OT19SRUxFQVNFX0NIRUNLOiAxIH0sIHByb2Nlc3MuZW52XG4gICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApLm9uKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoY29kZSAhPT0gMCB8fCAhdGhpcy5jaGVja1BhY2thZ2VzKHBhY2thZ2VzKSkge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoJ2FkZGluZyBwYWNrYWdlcyBmYWlsZWQnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUNBOztBQUNBOztBQUNBOztBQUVBOzs7O0FBTEE7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ2UsTUFBTUEsYUFBTixDQUFvQjtFQUMvQjtBQUNKO0FBQ0E7QUFDQTtFQUNJQyxXQUFXLENBQUNDLENBQUQsRUFBSTtJQUNYLEtBQUtDLEdBQUwsR0FBVyxJQUFJQyxZQUFKLENBQVEsZUFBUixDQUFYO0lBQ0EsS0FBS0YsQ0FBTCxHQUFTQSxDQUFUO0VBQ0g7RUFFRDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztFQUNJRyxhQUFhLENBQUNDLFFBQUQsRUFBVztJQUNwQixNQUFNQyxZQUFZLEdBQUdDLFdBQUEsQ0FDaEJDLFlBRGdCLENBQ0gsS0FBS1AsQ0FBTCxDQUFPUSxHQUFQLENBQVdDLEtBQVgsQ0FBaUJDLFNBQWpCLENBQTJCTixRQUR4QixFQUNrQyxPQURsQyxFQUVoQk8sT0FGZ0IsQ0FFUixNQUZRLEVBRUEsRUFGQSxFQUdoQkMsS0FIZ0IsQ0FHVixJQUhVLEVBSWhCQyxNQUpnQixDQUlUQyxJQUFJLElBQUksQ0FBQ0EsSUFBSSxDQUFDQyxJQUFMLEdBQVlDLFVBQVosQ0FBdUIsR0FBdkIsQ0FKQSxDQUFyQjs7SUFLQSxPQUFPLENBQUNaLFFBQVEsQ0FBQ2EsSUFBVCxDQUNKQyxhQUFhLElBQ1QsQ0FBQ2IsWUFBWSxDQUFDWSxJQUFiLENBQWtCRSxhQUFhLElBQUksQ0FBQ0EsYUFBYSxDQUFDQyxPQUFkLENBQXNCRixhQUF0QixDQUFwQyxDQUZELENBQVI7RUFJSDtFQUVEO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0VBQ0lHLG9CQUFvQixDQUFDakIsUUFBRCxFQUFXO0lBQzNCLE1BQU1DLFlBQVksR0FBR0MsV0FBQSxDQUFHQyxZQUFILENBQWdCLEtBQUtQLENBQUwsQ0FBT1EsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQlksUUFBM0MsRUFBcUQsT0FBckQsRUFDaEJYLE9BRGdCLENBQ1IsTUFEUSxFQUNBLEVBREEsRUFFaEJDLEtBRmdCLENBRVYsSUFGVSxDQUFyQjs7SUFHQSxPQUFPLENBQUNSLFFBQVEsQ0FBQ2EsSUFBVCxDQUNKQyxhQUFhLElBQUksQ0FBQ2IsWUFBWSxDQUFDWSxJQUFiLENBQWtCRSxhQUFhLElBQUlBLGFBQWEsS0FBS0QsYUFBckQsQ0FEZCxDQUFSO0VBR0g7RUFFRDtBQUNKO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7RUFDd0IsTUFBZEssY0FBYyxDQUFDbkIsUUFBRCxFQUFXb0IsbUJBQVgsRUFBZ0NDLEdBQWhDLEVBQXFDO0lBQ3JELElBQUksQ0FBQyxLQUFLdEIsYUFBTCxDQUFtQkMsUUFBbkIsQ0FBTCxFQUFtQztNQUMvQixLQUFLSCxHQUFMLENBQVN5QixJQUFULENBQWUsR0FBRUQsR0FBSSxpRkFBckI7O01BQ0EsSUFBSTtRQUNBLE1BQU0sS0FBS0UsV0FBTCxDQUFpQnZCLFFBQWpCLEVBQTJCb0IsbUJBQTNCLENBQU47TUFDSCxDQUZELENBRUUsT0FBT0ksQ0FBUCxFQUFVO1FBQ1IsTUFBTSxJQUFJQyxLQUFKLENBQVVELENBQVYsQ0FBTjtNQUNIO0lBQ0o7O0lBQ0QsSUFBSSxDQUFDLEtBQUtQLG9CQUFMLENBQTBCRyxtQkFBMUIsQ0FBTCxFQUFxRDtNQUNqRCxLQUFLdkIsR0FBTCxDQUFTeUIsSUFBVCxDQUFlLEdBQUVELEdBQUksb0RBQXJCOztNQUNBLElBQUk7UUFDQSxNQUFNLEtBQUtFLFdBQUwsQ0FBaUJ2QixRQUFqQixFQUEyQm9CLG1CQUEzQixDQUFOO01BQ0gsQ0FGRCxDQUVFLE9BQU9JLENBQVAsRUFBVTtRQUNSLE1BQU0sSUFBSUMsS0FBSixDQUFVRCxDQUFWLENBQU47TUFDSDtJQUNKO0VBQ0o7RUFFRDtBQUNKO0FBQ0E7QUFDQTs7O0VBQ0lFLGNBQWMsQ0FBQzFCLFFBQUQsRUFBVztJQUNyQixLQUFLSCxHQUFMLENBQVN5QixJQUFULENBQWMsdUNBQWQsRUFBdUQsR0FBR3RCLFFBQTFEO0lBQ0EsT0FBTyxJQUFJMkIsT0FBSixDQUFZLENBQUNDLE9BQUQsRUFBVUMsTUFBVixLQUFxQjtNQUNwQyxJQUFBQyxtQkFBQSxFQUNJLFFBREosRUFFSSxDQUFDLFFBQUQsRUFBV0MsTUFBWCxDQUFrQi9CLFFBQWxCLENBRkosRUFFaUM7UUFDekJnQyxHQUFHLEVBQUUsS0FBS3BDLENBQUwsQ0FBT1EsR0FBUCxDQUFXQyxLQUFYLENBQWlCQyxTQUFqQixDQUEyQjJCLElBRFA7UUFFekJDLEtBQUssRUFBRSxDQUFDLE1BQUQsRUFBUyxNQUFULEVBQWlCQyxPQUFPLENBQUNDLE1BQXpCLENBRmtCO1FBR3pCaEMsR0FBRyxFQUFFaUMsTUFBTSxDQUFDQyxNQUFQLENBQ0Q7VUFBRUMsb0JBQW9CLEVBQUUsQ0FBeEI7VUFBMkJDLHVCQUF1QixFQUFFO1FBQXBELENBREMsRUFDd0RMLE9BQU8sQ0FBQy9CLEdBRGhFO01BSG9CLENBRmpDLEVBU0VxQyxFQVRGLENBU0ssTUFUTCxFQVNjQyxJQUFELElBQVU7UUFDbkIsSUFBSUEsSUFBSSxLQUFLLENBQVQsSUFBYyxLQUFLM0MsYUFBTCxDQUFtQkMsUUFBbkIsQ0FBbEIsRUFBZ0Q7VUFDNUM2QixNQUFNLENBQUMsMEJBQUQsQ0FBTjtRQUNILENBRkQsTUFFTztVQUNIRCxPQUFPO1FBQ1Y7TUFDSixDQWZEO0lBZ0JILENBakJNLENBQVA7RUFrQkg7RUFFRDtBQUNKO0FBQ0E7QUFDQTtBQUNBOzs7RUFDSUwsV0FBVyxDQUFDdkIsUUFBRCxFQUFXb0IsbUJBQVgsRUFBZ0M7SUFDdkMsS0FBS3ZCLEdBQUwsQ0FBUzhDLElBQVQsQ0FBYyxtQ0FBZCxFQUFtRCxHQUFHdkIsbUJBQXREO0lBQ0EsT0FBTyxJQUFJTyxPQUFKLENBQVksQ0FBQ0MsT0FBRCxFQUFVQyxNQUFWLEtBQXFCO01BQ3BDLElBQUFDLG1CQUFBLEVBQ0ksUUFESixFQUVJLENBQUMsS0FBRCxFQUFRQyxNQUFSLENBQ0lYLG1CQUFtQixDQUFDd0IsR0FBcEIsQ0FBd0JDLFdBQVcsSUFBSUEsV0FBVyxDQUFDdEMsT0FBWixDQUFvQixHQUFwQixFQUF5QixJQUF6QixDQUF2QyxDQURKLENBRkosRUFLSTtRQUNJeUIsR0FBRyxFQUFFLEtBQUtwQyxDQUFMLENBQU9RLEdBQVAsQ0FBV0MsS0FBWCxDQUFpQkMsU0FBakIsQ0FBMkIyQixJQURwQztRQUVJQyxLQUFLLEVBQUUsQ0FBQyxNQUFELEVBQVMsTUFBVCxFQUFpQkMsT0FBTyxDQUFDQyxNQUF6QixDQUZYO1FBR0loQyxHQUFHLEVBQUVpQyxNQUFNLENBQUNDLE1BQVAsQ0FDRDtVQUFFQyxvQkFBb0IsRUFBRSxDQUF4QjtVQUEyQkMsdUJBQXVCLEVBQUU7UUFBcEQsQ0FEQyxFQUN3REwsT0FBTyxDQUFDL0IsR0FEaEU7TUFIVCxDQUxKLEVBWUVxQyxFQVpGLENBWUssTUFaTCxFQVljQyxJQUFELElBQVU7UUFDbkIsSUFBSUEsSUFBSSxLQUFLLENBQVQsSUFBYyxDQUFDLEtBQUszQyxhQUFMLENBQW1CQyxRQUFuQixDQUFuQixFQUFpRDtVQUM3QzZCLE1BQU0sQ0FBQyx3QkFBRCxDQUFOO1FBQ0gsQ0FGRCxNQUVPO1VBQ0hELE9BQU87UUFDVjtNQUNKLENBbEJEO0lBbUJILENBcEJNLENBQVA7RUFxQkg7O0FBNUg4QiJ9