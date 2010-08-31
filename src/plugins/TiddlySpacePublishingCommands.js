/***
|''Name''|TiddlySpacePublishingCommands|
|''Version''|0.6.0|
|''Status''|@@beta@@|
|''Description''|toolbar commands for drafting and publishing|
|''Author''|Jon Robson|
|''Source''|http://github.com/TiddlySpace/tiddlyspace/raw/master/src/plugins/TiddlySpacePublishingCommands.js|
|''Requires''|TiddlySpaceConfig ServerSideSavingPlugin|
!Code
***/
//{{{
(function($) {

var tiddlyspace = config.extensions.tiddlyspace;

var cmd = config.commands.publishTiddler = {
	text: "publish",
	tooltip: "Change the public/private state of this tiddler",
	errorMsg: "Error publishing %0: %1",

	isEnabled: function(tiddler) {
		if(readOnly || !store.tiddlerExists(tiddler.title)) {
			return false;
		}
		var space = tiddlyspace.determineSpace(tiddler, true);
		return space && space.name == tiddlyspace.currentSpace.name &&
			space.type == "private";
	},
	handler: function(ev, src, title) {
		var tiddler = store.getTiddler(title);
		if(tiddler) {
			var newWorkspace = tiddler.fields["server.workspace"];
			newWorkspace = cmd.toggleWorkspace(newWorkspace);
			this.moveTiddler(tiddler, {
				title: tiddler.title,
				fields: { "server.workspace": newWorkspace }
			}, true);
		}
	},
	toggleBag: function(bag, to) {
		var newBag;
		if(typeof bag != typeof "") {
			var tiddler = bag;
			bag = tiddler.fields["server.bag"];
		}
		if(bag.indexOf("_private") > -1) { // should make use of endsWith
			to = to ? to : "public";
			newBag = bag.replace("_private", "_" + to);
		} else {
			to = to ? to : "private";
			newBag = bag.replace("_public", "_" + to);
		}
		return newBag;
	},
	toggleWorkspace: function(workspace, to) {
		if(typeof workspace != typeof "") {
			var tiddler = workspace;
			var bag = tiddler.fields["server.bag"];
			workspace = bag ? "bags/%0".format([bag]) : tiddler.fields["server.workspace"];
		}
		var newWorkspace;
		if(workspace.indexOf("_private") > -1) { // should make use of endsWith
			to = to ? to : "public";
			newWorkspace = workspace.replace("_private", "_" + to);
		} else {
			to = to ? to : "private";
			newWorkspace = workspace.replace("_public", "_" + to);
		}
		return newWorkspace;
	},
	copyTiddler: function(title, newBag, callback) {
		var original = store.getTiddler(title);
		var adaptor = original.getAdaptor();
		var publish = function(original, callback) {
			var tiddler = $.extend(new Tiddler(original.title), original);
			tiddler.fields = $.extend({}, original.fields, {
				"server.bag": newBag,
				"server.workspace": "bags/%0".format([newBag]),
				"server.page.revision": "false"
			});
			adaptor.putTiddler(tiddler, null, null, callback);
		};
		publish(original, callback);
	},
	moveTiddler: function(tiddler, newTiddler, withRevisions, callback) {
		if(withRevisions) {
			this.moveTiddlerWithRevisions(tiddler, newTiddler, callback);
		} else {
			var info = {
				copyContext: {},
				deleteContext: {}
			};
			var _dirty = store.isDirty();
			var adaptor = tiddler.getAdaptor();
			var newTitle = newTiddler.title;
			var oldTitle = tiddler.title;
			delete tiddler.fields["server.workspace"];
			var oldBag = tiddler.fields["server.bag"];
			var newBag = newTiddler.fields["server.bag"];
			var newWorkspace = "bags/%0".format([newBag]);
			cmd.copyTiddler(oldTitle, newBag, function(ctx) {
					info.copyContext = ctx;
					var context = {
						tiddler: tiddler,
						workspace: newWorkspace
					};
					tiddler.title = oldTitle; // for cases where a rename occurs
					if(ctx.status) { // only do if a success
						if(oldBag != newBag) {
							adaptor.deleteTiddler(tiddler, context, {}, function(ctx) {
								info.deleteContext = ctx;
								var el;
								if(tiddler) {
									tiddler.fields["server.workspace"] = newWorkspace;
									tiddler.fields["server.bag"] = newBag;
									store.addTiddler(tiddler);
								}
								if(oldTitle != newTitle) {
									store.removeTiddler(oldTitle);
									el = story.closeTiddler(oldTitle);
								}
								el = el ? el : story.refreshTiddler(newTitle, true);
								if(el) {
									story.displayTiddler(el, newTitle);
								}
								if(callback) {
									callback(info);
								}
								store.setDirty(_dirty);
							});
						} else {
							if(callback) {
								callback(info);
							}
							story.refreshTiddler(newTitle, true);
						}
					}
			});
		}
	},
	moveTiddlerWithRevisions: function(tiddler, newTiddler, callback) {
		var adaptor = tiddler.getAdaptor();
		var oldBag = tiddler.fields["server.bag"];
		var oldTitle = tiddler.title;
		var newTitle = newTiddler.title;
		var newBag = newTiddler.fields["server.bag"];
		delete tiddler.fields["server.workspace"];
		delete newTiddler.fields["server.workspace"];
		var oldWorkspace = "bags/%0".format([oldBag]);
		var newWorkspace = "bags/%0".format([newBag]);
		var info = {};
		if(oldBag == newBag) { // we are in a dangerous error state
			return callback ? callback(info) : false;
		}
		// we first must delete any existing public revisions
		tiddler.title = newTitle;
		tiddler.fields["server.bag"] = newBag;
		tiddler.fields["server.workspace"] = newWorkspace;
		tiddler.fields["server.page.revision"] = "false"; // force this action
		adaptor.deleteTiddler(tiddler, {}, {},
			function(ctx) {
				info.deleteContext = ctx;
				tiddler.fields["server.workspace"] = oldWorkspace;
				tiddler.fields["server.bag"] = oldBag; // rectify above change to workspace
				adaptor.moveTiddler(
					{ title: oldTitle, workspace: oldWorkspace },
					{ title: newTitle, workspace: newWorkspace },
					{}, {},
					function(context) {
						info.moveContext = context;
						if(context.status) {
							var newTiddler = context.tiddler;
							newTiddler.fields["server.workspace"] = newWorkspace;
							// some some reason the old tiddler is not being removed from the store (hence next 3 lines)
							var oldDirty = store.isDirty();
							store.removeTiddler(oldTitle);
							store.setDirty(oldDirty);
							store.addTiddler(newTiddler); // note the tiddler may have changed name
							var old = story.refreshTiddler(oldTitle, true);
							if(old) {
								story.displayTiddler(old, newTitle);
							}
						}
						if(callback) {
							callback(info);
						}
					}
				);
		});
	}
};

config.commands.changeToPrivate = {
	text: "make private",
	tooltip: "turn this public tiddler into a private tiddler",
	handler: function(event, src, title) {
		var tiddler = store.getTiddler(title);
		var newBag = cmd.toggleBag(tiddler, "private");
		var newTiddler = { title: title, fields: { "server.bag": newBag }};
		cmd.moveTiddler(tiddler, newTiddler, true);
	}
};
config.commands.changeToPublic = {
	text: "make public",
	tooltip: "turn this private tiddler into a public tiddler",
	handler: function(event, src, title) {
		var tiddler = store.getTiddler(title);
		var newBag = cmd.toggleBag(tiddler, "public");
		var newTiddler = { title: title, fields: { "server.workspace": newBag }};
		cmd.moveTiddler(tiddler, newTiddler, true);
	}
};

config.commands.deleteTiddler.deleteResource = function(tiddler, bag, userCallback) {
	var workspace = "bags/%0".format([bag]);
	var oldDirty = store.isDirty();
	var originalBag = tiddler.fields["server.bag"];
	var originalWorkspace = "bags/%0".format([originalBag]);
	var deleteLocal = originalWorkspace == workspace;
	var context = {
		tiddler: tiddler,
		workspace: workspace
	};
	tiddler.fields["server.bag"] = bag;
	tiddler.fields["server.workspace"] = context.workspace;
	tiddler.fields["server.page.revision"] = "false";
	delete tiddler.fields["server.etag"];
	var callback;
	if(workspace == originalWorkspace) {
		callback = config.extensions.ServerSideSavingPlugin.removeTiddlerCallback;
	} else {
		callback = function(context, userParams) {
			if(context.status) {
				var el = story.refreshTiddler(tiddler.title, true);
				if(deleteLocal) { // remove it locally to trigger getting of public version
					store.removeTiddler(tiddler.title);
				} else {
					tiddler.fields["server.workspace"] = originalWorkspace;
					tiddler.fields["server.bag"] = originalBag;
				}
				if(el) {
					story.displayTiddler(el, tiddler.title);
				}
				store.setDirty(oldDirty); // will fail to delete locally and throw an error
			}
			if(userCallback) {
				userCallback(context);
			}
		};
	}
	tiddler.getAdaptor().deleteTiddler(tiddler, context, {}, callback);
};

config.commands.deletePublicTiddler = {
	text: "delete public",
	tooltip: "Delete any public versions of this tiddler",
	isEnabled: function(tiddler) {
		return tiddler.fields["server.workspace"];
	},
	handler: function(event, src, title) {
		var tiddler = store.getTiddler(title);
		var bag = cmd.toggleBag(tiddler, "public");
		config.commands.deleteTiddler.deleteResource(tiddler, bag);
	}
};

config.commands.deletePrivateTiddler = {
	text: "delete private",
	tooltip: "delete any private versions of this tiddler",
	handler: function(event, src, title) {
		var tiddler = store.getTiddler(title);
		var bag = cmd.toggleBag(tiddler, "private");
		config.commands.deleteTiddler.deleteResource(tiddler, bag);
	}
};
/* Save as draft command */
config.commands.saveDraft = {
	text: "save draft",
	tooltip: "Save as a private draft",
	isEnabled: function(tiddler) {
		if(tiddler) {
			var workspace = tiddler.fields["server.workspace"];
			if(workspace && workspace.indexOf("_public") > -1) {
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	},
	handler: function(ev, src, title) {
		// TODO: when creating a draft also copy over revisions from the public version
		var tiddler = store.getTiddler(title); // original tiddler
		var tidEl = story.getTiddler(title);
		var fields = {};
		story.gatherSaveFields(tidEl, fields);
		var extendedFields = merge({}, config.defaultCustomFields);
		var currentSpace = tiddlyspace.currentSpace.name;
		var privateWorkspace = "recipes/%0_private".format([currentSpace]);
		var draftTitle;
		var draftNum = "";
		while(!draftTitle) {
			var suggestedTitle = "%0 [draft%1]".format([title, draftNum]);
			if(store.getTiddler(suggestedTitle)) {
				draftNum = !draftNum ? 2 : draftNum + 1;
			} else {
				draftTitle = suggestedTitle;
			}
		}

		extendedFields["server.publish.name"] = title;
		extendedFields["server.workspace"] = privateWorkspace;
		var newDate = new Date();
		for(var n in fields) {
			if(!TiddlyWiki.isStandardField(n)) {
				extendedFields[n] = fields[n];
			}
		}
		tiddler = store.saveTiddler(draftTitle, draftTitle, fields.text, config.options.txtUserName,
			newDate, fields.tags, extendedFields);
		autoSaveChanges(null, [tiddler]);
		story.closeTiddler(title);
		story.displayTiddler(src, draftTitle);
		return draftTitle;
	}
};

})(jQuery);
//}}}
