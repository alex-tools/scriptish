// JSM exported symbols
var EXPORTED_SYMBOLS = ["Config"];

const Cu = Components.utils;
Cu.import("resource://scriptish/constants.js");
Cu.import("resource://scriptish/prefmanager.js");
Cu.import("resource://scriptish/utils.js");
Cu.import("resource://scriptish/utils/GM_getWriteStream.js");
Cu.import("resource://scriptish/script/script.js");
Cu.import("resource://gre/modules/AddonManager.jsm");

function Config(aBaseDir) {
  this._saveTimer = null;
  this._scripts = null;
  this._scriptFoldername = aBaseDir;

  this._configFile = this._scriptDir;
  this._configFile.append("config.xml");

  this._initScriptDir();

  this._observers = [];

  this._load();
}

Config.prototype = {
  addObserver: function(observer, script) {
    var observers = script ? script._observers : this._observers;
    observers.push(observer);
  },

  removeObserver: function(observer, script) {
    var observers = script ? script._observers : this._observers;
    var index = observers.indexOf(observer);
    if (index == -1) throw new Error("Observer not found");
    observers.splice(index, 1);
  },

  _notifyObservers: function(script, event, data) {
    var observers = this._observers.concat(script._observers);
    for (var i = 0, observer; observer = observers[i]; i++) {
      observer.notifyEvent(script, event, data);
    }
  },

  _changed: function(script, event, data, dontSave) {
    if (!dontSave) {
      this._save();
    }

    this._notifyObservers(script, event, data);
  },

  installIsUpdate: function(script) {
    return this._find(script) > -1;
  },

  addScript: function(aScript) {
    this._scripts.push(aScript);
  },

  _find: function(aScript) {
    var id = aScript.id;
    var scripts = this._scripts;

    for (var i = 0, script; script = scripts[i]; i++) {
      if (script.id == id) return i;
    }

    return -1;
  },

  getScriptById: function(aId) {
    for (var i = 0, script; script = this._scripts[i]; i++) {
      if (script.id === aId) {
        return script;
      }
    }

    return null;
  },

  _load: function() {
    var domParser = Cc["@mozilla.org/xmlextras/domparser;1"]
        .createInstance(Ci.nsIDOMParser);

    var configContents = GM_getContents(this._configFile);
    var doc = domParser.parseFromString(configContents, "text/xml");
    var nodes = doc.evaluate("/UserScriptConfig/Script", doc, null, 0, null);
    var fileModified = false;

    this._scripts = [];

    for (var node = null; node = nodes.iterateNext(); ) {
      fileModified = Script.load(this, node) || fileModified;
    }

    if (fileModified) {
      this._save();
    }
  },

  _save: function(saveNow) {
    // If we have not explicitly been told to save now, then defer execution
    // via a timer, to avoid locking up the UI.
    if (!saveNow) {
      // Reduce work in the case of many changes near to each other in time.
      if (this._saveTimer) {
        this._saveTimer.cancel(this._saveTimer);
      }

      this._saveTimer = Cc["@mozilla.org/timer;1"]
          .createInstance(Ci.nsITimer);

      var _save = GM_hitch(this, "_save"); // dereference 'this' for the closure
      this._saveTimer.initWithCallback(
          {'notify': function() { _save(true); }}, 250,
          Ci.nsITimer.TYPE_ONE_SHOT);
      return;
    }

    var doc = Cc["@mozilla.org/xmlextras/domparser;1"]
      .createInstance(Ci.nsIDOMParser)
      .parseFromString("<UserScriptConfig></UserScriptConfig>", "text/xml");

    this._scripts.forEach(function(script) {
      doc.firstChild.appendChild(doc.createTextNode("\n\t"));
      doc.firstChild.appendChild(script.createXMLNode(doc));
    });

    doc.firstChild.appendChild(doc.createTextNode("\n"));

    var configStream = GM_getWriteStream(this._configFile);
    Cc["@mozilla.org/xmlextras/xmlserializer;1"]
      .createInstance(Ci.nsIDOMSerializer)
      .serializeToStream(doc, configStream, "utf-8");
    configStream.close();
  },

  parse: function(source, uri, updating) {
    return Script.parse(this, source, uri, updating);
  },

  install: function(script) {
    GM_log("> Config.install");

    var existingIndex = this._find(script);
    if (existingIndex > -1) {
      // save the old script's state
      script._enabled = this._scripts[existingIndex].enabled;

      // unintall the old script
      this.uninstall(this._scripts[existingIndex]);
    }

    script.installProcess();

    this.addScript(script);
    this._changed(script, "install", null);
    AddonManagerPrivate.callInstallListeners(
        "onExternalInstall", null, script, null, false);

    GM_log("< Config.install");
  },

  uninstall: function(script) {
    var idx = this._find(script);
    this._scripts.splice(idx, 1);
    this._changed(script, "uninstall", null);

    // watch out for cases like basedir="." and basedir="../gm_scripts"
    if (!script._basedirFile.equals(this._scriptDir)) {
      // if script has its own dir, remove the dir + contents
      script._basedirFile.remove(true);
    } else {
      // if script is in the root, just remove the file
      script._file.remove(false);
    }

    if (GM_prefRoot.getValue("uninstallPreferences")) {
      // Remove saved preferences
      GM_prefRoot.remove(script.prefroot);
    }
  },

  /**
   * Moves an installed user script to a new position in the array of installed scripts.
   *
   * @param script The script to be moved.
   * @param destination Can be either (a) a numeric offset for the script to be
   *                    moved by, or (b) another installed script to which
   *                    position the script will be moved.
   */
  move: function(script, destination) {
    // If the destination is zero, then there is nothing to move. 
    if (0 == destination) return;

    var from = this._scripts.indexOf(script);
    // Make sure the user script is installed
    if (from == -1) return;

    var to = -1;
    if (typeof destination == "number") { // if destination is an offset
      to = from + destination;
      to = Math.max(0, to);
      to = Math.min(this._scripts.length - 1, to);
    } else { // if destination is a script object
      to = this._scripts.indexOf(destination);
    }
    if (to == -1) return;

    var data = {
      "to": to, 
      "insertBefore": (to > from) ? to+1 : to
    }

    var tmp = this._scripts.splice(from, 1)[0];
    this._scripts.splice(to, 0, tmp);
    this._changed(script, "move", data);
  },
  movePast: function(aScript, aReferenceScript) {
    if (!aScript || !aReferenceScript) return;

    var scripts = this._scripts;
    var to = scripts.indexOf(aReferenceScript);
    var from = scripts.indexOf(aScript);
    var diff = (to - from);

    // Don't need to move
    if (0 == diff) return;

    // Make sure that both scripts are installed.
    if (-1 == to || -1 == from) return;

    this.move(aScript, diff);
  },

  sort: function() {
    var scripts = this._scripts;

    // sort the scripts
    scripts.sort(function(a, b) {
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });

    for (var i = 0, script; script = scripts[i]; i++) {
      this._changed(script, "move", i);
    }

    this._save();
  },

  get _scriptDir() {
    var tools = {};
    Cu.import("resource://scriptish/utils/GM_getProfileFile.js", tools);
    return tools.GM_getProfileFile(this._scriptFoldername);
  },

  /**
   * Create an empty configuration if none exist.
   */
  _initScriptDir: function() {
    var dir = this._scriptDir;

    // if the folder does not exist
    if (!dir.exists()) {
      dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);

      // create config.xml file
      var configStream = GM_getWriteStream(this._configFile);
      var xml = "<UserScriptConfig/>";
      configStream.write(xml, xml.length);
      configStream.close();
    }
  },

  get scripts() { return this._scripts.concat(); },
  getMatchingScripts: function(testFunc) { return this._scripts.filter(testFunc); },
  injectScript: function(script) {
    var unsafeWin = this.wrappedContentWin.wrappedJSObject;
    var unsafeLoc = new XPCNativeWrapper(unsafeWin, "location").location;
    var href = new XPCNativeWrapper(unsafeLoc, "href").href;

    if (script.enabled && !script.needsUninstall && script.matchesURL(href)) {
      gmService.injectScripts([script], href, unsafeWin, this.chromeWin);
    }
  },

  updateModifiedScripts: function() {
    // Find any updated scripts
    var scripts = this.getMatchingScripts(
        function (script) { return script.isModified(); });
    if (0 == scripts.length) return;

    for (var i = 0, script; script = scripts[i]; i++) {
      var parsedScript = this.parse(
          GM_getContents(script._file), {spec: script._downloadURL}, true);
      script.updateFromNewScript(parsedScript);
      this._changed(script, "modified", null, true);
    }

    this._save();
  }
};