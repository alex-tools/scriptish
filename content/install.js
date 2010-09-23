
Components.utils.import("resource://scriptish/logging.js");

var Scriptish_Install = {
  init: function() {
    var ioservice = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService);

    this.htmlNs_ = "http://www.w3.org/1999/xhtml";

    this.scriptDownloader_ = window.arguments[0];
    var script = this.script_ = this.scriptDownloader_.script;

    this.setupIncludes("match", "matches", "matches-desc", script.matches);
    this.setupIncludes("include", "includes", "includes-desc", script.includes);
    this.setupIncludes("include", "excludes", "excludes-desc", script.excludes);

    this.dialog_ = document.documentElement;
    this.extraButton_ = this.dialog_.getButton("extra1");
    this.extraButton_.setAttribute("type", "checkbox");

    this.acceptButton_ = this.dialog_.getButton("accept");
    this.acceptButton_.baseLabel = this.acceptButton_.label;

    this.timer_ = null;
    this.seconds_ = 0;
    this.startTimer();

    this.bundle = document.getElementById("scriptish-browser-bundle");
    this.greetz = new Array();
    for(var i = 0; i < 6; i++){
      this.greetz.push(this.bundle.getString("greetz." + i));
    }

    var pick = Math.round(Math.random() * (this.greetz.length - 1));
    var heading = document.getElementById("heading");
    heading.appendChild(document.createElementNS(this.htmlNs_, "strong"));
    heading.firstChild.appendChild(document.createTextNode(this.greetz[pick]));
    heading.appendChild(document.createTextNode(" " + this.bundle.getString("greeting.msg")));

    var desc = document.getElementById("scriptDescription");
    desc.appendChild(document.createElementNS(this.htmlNs_, "strong"));
    desc.firstChild.appendChild(document.createTextNode(script.name + " " + script.version));
    desc.appendChild(document.createElementNS(this.htmlNs_, "br"));
    desc.appendChild(document.createTextNode(script.description));
  },

  onFocus: function(e) {
    this.startTimer();
  },

  onBlur: function(e) {
    this.stopTimer();
  },

  startTimer: function() {
    this.seconds_ = 4;
    this.updateLabel();

    if (this.timer_) {
      window.clearInterval(this.timer_);
    }

    this.timer_ = window.setInterval(function() { Scriptish_Install.onInterval() }, 500);
  },

  onInterval: function() {
    this.seconds_--;
    this.updateLabel();

    if (this.seconds_ == 0) {
      this.timer_ = window.clearInterval(this.timer_);
    }
  },

  stopTimer: function() {
    this.seconds_ = 5;
    this.timer_ = window.clearInterval(this.timer_);
    this.updateLabel();
  },

  updateLabel: function() {
    if (this.seconds_ > 0) {
      this.acceptButton_.focus();
      this.acceptButton_.disabled = true;
      this.acceptButton_.label = this.acceptButton_.baseLabel + " (" + this.seconds_ + ")";
    } else {
      this.acceptButton_.disabled = false;
      this.acceptButton_.label = this.acceptButton_.baseLabel;
    }
  },

  setupIncludes: function(type, box, desc, includes) {
    if (includes.length > 0) {
      desc = document.getElementById(desc);
      document.getElementById(box).setAttribute("class", "display");

      if (type == "match") {
        for (var i = 0; i < includes.length; i++) {
          desc.appendChild(document.createTextNode(includes[i].pattern));
          desc.appendChild(document.createElementNS(this.htmlNs_, "br"));
        }
      } else {
        for (var i = 0; i < includes.length; i++) {
          desc.appendChild(document.createTextNode(includes[i]));
          desc.appendChild(document.createElementNS(this.htmlNs_, "br"));
        }
      }

      desc.removeChild(desc.lastChild);
    }
  },

  onOK: function() {
    this.scriptDownloader_.installScript();
    window.setTimeout("window.close()", 0);
  },

  onCancel: function(){
    this.scriptDownloader_.cleanupTempFiles();
    window.close();
  },

  onShowSource: function() {
    this.scriptDownloader_.showScriptView();
    window.setTimeout("window.close()", 0);
  }
};

// See: closewindow.xul
function Scriptish_onClose() { Scriptish.onCancel(); }
