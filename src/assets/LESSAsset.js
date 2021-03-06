const Asset = require('../Asset');
const localRequire = require('../utils/localRequire');
const promisify = require('../utils/promisify');
const Resolver = require('../Resolver');
const fs = require('../utils/fs');
const path = require('path');

class LESSAsset extends Asset {
  constructor(name, options) {
    super(name, options);
    this.type = 'css';
  }

  async parse(code) {
    // less should be installed locally in the module that's being required
    let less = await localRequire('less', this.name);
    let render = promisify(less.render.bind(less));

    let opts =
      (await this.getConfig(['.lessrc', '.lessrc.js'], {packageKey: 'less'})) ||
      {};
    opts.filename = this.name;
    opts.plugins = (opts.plugins || []).concat(urlPlugin(this));

    return await render(code, opts);
  }

  collectDependencies() {
    for (let dep of this.ast.imports) {
      this.addDependency(dep, {includedInParent: true});
    }
  }

  generate() {
    return [
      {
        type: 'css',
        value: this.ast ? this.ast.css : '',
        hasDependencies: false
      }
    ];
  }
}

function urlPlugin(asset) {
  return {
    install: (less, pluginManager) => {
      let visitor = new less.visitors.Visitor({
        visitUrl: node => {
          node.value.value = asset.addURLDependency(
            node.value.value,
            node.currentFileInfo.filename
          );
          return node;
        }
      });

      visitor.run = visitor.visit;
      pluginManager.addVisitor(visitor);

      let LessFileManager = getFileManager(less, asset.options);
      pluginManager.addFileManager(new LessFileManager());
    }
  };
}

function getFileManager(less, options) {
  const resolver = new Resolver({
    extensions: ['.css', '.less'],
    rootDir: options.rootDir
  });

  class LessFileManager extends less.FileManager {
    supports() {
      return true;
    }

    supportsSync() {
      return false;
    }

    async loadFile(filename, currentDirectory) {
      let resolved = await resolver.resolve(
        filename,
        path.join(currentDirectory, 'index')
      );
      return {
        contents: await fs.readFile(resolved.path, 'utf8'),
        filename: resolved.path
      };
    }
  }

  return LessFileManager;
}

module.exports = LESSAsset;
