define(['durandal/app', 'lodash', 'state', 'bloodhound', 'searchapi', 'mediawiki'],  function (app, _, state, Bloodhound, searchapi, mediawiki) {
	// interpretes intention from string 
	interpreter = function(){
		var self = this;
		this.sc_holdder_ref = null;

		
		this.cardTitleSearchEngine = null;
		this.frameviewSearchEngine = null;

		this.currentPrefix = '';
		this.filteredCardTitles = [];
		this.filteredFrameviewTitles = [];
		this.titleContextPrefix = '';

		this.sc_data_space = {
			card_titles : [{id:'test', title:'Test'}],
			frameview_titles : [{id:'home', title:'Home'}],
			thisframeview_ids:[],
			last_cmds : [],
			last_searches : [],
			successivepartialmatch_cmds : [],
			exactmatch_cmds : [],
		}

		this.preetyJson = {
			replacer: function(match, pIndent, pKey, pVal, pEnd) {
				var key = '<span class=json-key>';
				var val = '<span class=json-value>';
				var str = '<span class=json-string>';
				var r = pIndent || '';
				if (pKey)
					r = r + key + pKey.replace(/[": ]/g, '') + '</span>: ';
				if (pVal)
					r = r + (pVal[0] == '"' ? str : val) + pVal + '</span>';
				return r + (pEnd || '');
			},
			print: function(obj) {
				var jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
				return JSON.stringify(obj, null, 3)
					.replace(/&/g, '&amp;').replace(/\\"/g, '&quot;')
					.replace(/</g, '&lt;').replace(/>/g, '&gt;')
					.replace(jsonLine, self.preetyJson.replacer);
			}
		};

		this.cardTitleIfNotFound = '_Card_';
		this.searchTitles = function(search_str){
			self.cardTitleIfNotFound = search_str;
			if(self.cardTitleSearchEngine){
				self.filteredCardTitles = [];
				self.cardTitleSearchEngine.search(search_str, self.resurltOfSearchCardTitles);
			}
		}
		this.resurltOfSearchCardTitles = function(datum){
			self.filteredCardTitles = [];
			for(var i = 0; i < datum.length; i++){
				if(self.titleContextPrefix === '[thisframeview.title]'){
					if(_.find(self.sc_data_space.thisframeview_ids , function(e){return e === datum[i].id})){
						self.filteredCardTitles.push({id:datum[i].id, title:self.currentPrefix + " " + datum[i].title, desc:''});
					}
				}
				else{
					self.filteredCardTitles.push({id:datum[i].id, title:self.currentPrefix + " " + datum[i].title, desc:''});
				}
					
			}
			if(!datum.length){
				self.filteredCardTitles.push({title:self.currentPrefix + " " + self.cardTitleIfNotFound , desc:'add a card named \"' + self.cardTitleIfNotFound + '\"'});
			}
			self.sc_holdder_ref.emit_valid_commands_changed();
		};

		this.on_card_content_updated = function(card){
			if(card.TYPE.VOLATILE)return;

			var obj = _.find(self.sc_data_space.card_titles, function(v){return v.id === card.id});
			if(obj.title != card.card_data.card_content.title){
				obj.title = card.title;
				if(self.cardTitleSearchEngine)self.cardTitleSearchEngine.initialize(true);
			}
		};

		this.on_card_removed_from_frameview = function(card_id){
			_.remove(self.sc_data_space.thisframeview_ids, function(id){return id === card_id});
		};

		this.on_card_deleted_from_store = function(id){
			console.log('removing here as well');
			_.remove(self.sc_data_space.card_titles, function(ct){return ct.id === id});
			if(self.cardTitleSearchEngine) self.cardTitleSearchEngine.initialize(true);
		};
		this.init_app_events = function(){
			app.on('frameview:loded_with_ids').then(function(ids){
			     self.sc_data_space.thisframeview_ids = ids;
			});
			app.on('frameview:updated_with_ids').then(function(ids){// same as above but triggered when few cards are lodede from store rather than the whole frameview 
			     self.sc_data_space.thisframeview_ids = ids;
			});

			app.on('card:new_card_added_from_user_to_frameview').then(function(card){
				if(card.TYPE.VOLATILE)return;
				var obj = {id: card.id, title:card.card_data.card_content.title.replace(/<[^>]*>/g, "")};
				self.sc_data_space.card_titles.push(obj);
				if(self.cardTitleSearchEngine)self.cardTitleSearchEngine.add([obj]);
			});

			app.on('card:card_content_updated').then(self.on_card_content_updated);
			// app.on('card:removed_from_frameview').then(self.on_card_removed_from_frameview);
			// removed is called for each card removed from frameview
			// no need to listen it both remove and delete
			// removed is called for Volatile and non volatile cards
			// delete is called for only non volatile card
			// anyway volatile card list is not inserted in bloodhound
			app.on('card:deleted_from_store').then(on_card_deleted_from_store);


		}
		this.searchFrameviews = function(search_str){
			if(self.frameviewSearchEngine){
				self.frameviewSearchEngine.search(search_str, self.resurltOfSearchFrameviewTitles);
			}
		}

		this.resurltOfSearchFrameviewTitles = function(datum){
			console.log('result of search frameview', datum);
		}

		this.resolve_pattern = function(prefix, atomic_pattern, str){
			self.currentPrefix = prefix;
			self.titleContextPrefix = atomic_pattern;
			if(atomic_pattern === '[title]'){
				self.searchTitles(str);
			}
			else if(atomic_pattern === '[thisframeview.title]'){
				self.searchTitles(str);
			}
		}

		//******************************************************
		//ONLINE COMMAND SEARCH
		//******************************************************

		this.queryAnswers = [];
		this.queryQuestions = [];
		this.onlineSearchReply = {
			gotGoogleSuggestions: function(json){
				
				if(!json.CompleteSuggestion)return;
				self.queryAnswers = [];
				$.each(json.CompleteSuggestion, function(i, item){
					var title = item.suggestion? item.suggestion.data: '';
					if(title)self.queryAnswers.push({title:title, desc:''});
				});

				self.sc_holdder_ref.emit_valid_commands_changed();
			},
			gotWikipediaSuggestions: function(json){
				console.log(json);
				if(json.query && json.query.pages){
					self.queryAnswers = [];
				    $.each(json.query.pages, function(i,item){
				        var bind_data = {};
				        bind_data.title = item.title;
				        if(item.thumbnail && item.thumbnail.source)bind_data.thumb_source = item.thumbnail.source;
				        if(item.terms && item.terms.description && item.terms.description.length){
				            bind_data.desc = item.terms.description[0];
				        }else bind_data.desc = '';
				        
				        if(bind_data.title)self.queryAnswers.push(bind_data);
				    });

				    self.sc_holdder_ref.emit_valid_commands_changed();

				}
			},
			gotUmbelConcept: function(json){
				if(!json.results) return;
				console.log(json);
				self.queryAnswers = [];
				$.each(json.results, function(i, item){
				    _tok = item['pref-label'];
				    // console.log(_tok);
				    if(_tok)self.queryAnswers.push({title:_tok, desc:item.description});
				});

				self.sc_holdder_ref.emit_valid_commands_changed();
			},
			gotDuckDuckGoSuggestions : function(json){
				if(!json.RelatedTopics.length)return;

				self.queryAnswers = [];
				$.each(json.RelatedTopics, function(i, item){
					console.log(item);
				    if(item.hasOwnProperty('Name')){
				        $.each(item.Topics, function(j, childItem){
				            var _tok = childItem.FirstURL.split('/');
				            if(_tok){
				                _tok = _tok[_tok.length-1]; //get the last value
				                _tok = _tok.split('%2').join(' ').split('2%').join(' ').split('_').join(' ').split('%').join(' ');
				            }
				            self.queryAnswers.push({title:_tok, desc:childItem.Text});
				        });
				    }
				    else {
				        var _tok = item.FirstURL.split('/');
				        if(_tok){
				            _tok = _tok[_tok.length-1]; //get the last value
				            _tok = _tok.split('%2').join(' ').split('2%').join(' ').split('_').join(' ').split('%').join(' ');
				        }
				        self.queryAnswers.push({title:_tok, desc:item.Text});
				    }

				});
				self.sc_holdder_ref.emit_valid_commands_changed();
			},
			gotDbpediaLookupSuggestions: function(json){
				console.log(json);
				if(json.results && json.results.length){
				    $.each(json.results, function(i, item){
				        self.queryAnswers.push({title:item.label, desc:item.description});				        
				    });
				}
				self.sc_holdder_ref.emit_valid_commands_changed();
			},


		}


		this.onlineSearchQuery = {
			getGoogleSuggestions: function(query){
				searchapi.getGoogleSuggestion(query, self.onlineSearchReply.gotGoogleSuggestions);
			},
			getWikipediaSuggestions: function(query){
            	searchapi.wikipedia_suggest(query, self.onlineSearchReply.gotWikipediaSuggestions);
			},
			getUmbelConcept: function(query){
				searchapi.searchUmbelConcept(query, self.onlineSearchReply.gotUmbelConcept);
			},
			getDuckDuckGoSuggestions: function(query){
				searchapi.searchDuckDuckGo(query, self.onlineSearchReply.gotDuckDuckGoSuggestions)
			},
			getDbpediaLookupSuggestions: function(query){
				searchapi.searchDbpediaLookup(query, self.onlineSearchReply.gotDbpediaLookupSuggestions)
			},
		}
		
		this.onlineCommandSearch = function(cmd, query){
			
			var qsearch = self.onlineSearchQuery;
			if(cmd.length){
				if('wikipedia'.indexOf(cmd) === 0){
					self.queryQuestions.push({title:'wikipedia', desc:''});
					if(query.length) qsearch.getWikipediaSuggestions(query);
				}
				else if('google'.indexOf(cmd) === 0){
					self.queryQuestions.push({title:'google result', desc:''});
					if(query.length) qsearch.getGoogleSuggestions(query);
				}
				else if('umbel'.indexOf(cmd) === 0){
					self.queryQuestions.push({title:'umbel', desc:''});
					if(query.length) qsearch.getUmbelConcept(query);
				}
				else if('duckduckgo'.indexOf(cmd) === 0){
					self.queryQuestions.push({title:'duckduckgo', desc:''});
					if(query.length) qsearch.getDuckDuckGoSuggestions(query);
				}
				else if('dbpedialookup'.indexOf(cmd) === 0){
					self.queryQuestions.push({title:'dbpedia', desc:''});
					if(query.length) qsearch.getDbpediaLookupSuggestions(query);
				}
			}
		}

		this.keyUpTimeOutVar = null;// used for timer event
		minTimeIntervalForQuery = 1000; // ms
		this.last_query_str = '';

		this.explore = function(query){
			if(self.last_query_str === query)return;

			self.onlineCommandSearch('wikipedia', query);
			self.onlineCommandSearch('dbpedialookup', query);

			clearTimeout(self.keyUpTimeOutVar);
			var timeOutFunction = function(){
				self.send_msg_to_background("SW:QUESTION_FROM_TAB", {question:query});
			}
			self.keyUpTimeOutVar = setTimeout(timeOutFunction, minTimeIntervalForQuery);
			self.last_query_str = query;
		}


		//******************************************************
		//******************************************************
		this.RDF_MSG_TYPE = {
			LOAD_FROM_URL:1,
			CLEAR_DOCUMENT:2,
			GET_ANY:3,
			GET_THE:4,
			GET_MANY:5,
			S_MATCHING:6,
			ADD:7,
			REMOVE:8,
			GET_ALL_S:9,
			GET_ALL_P:10,
			GET_ALL_O:11,
		};

		this.rdfstore = {
			load_rdf_from_url: function(url){
				self.send_msg_to_background();
			},
		}
		this.send_msg_to_background= function(type, msg){
		    chrome.runtime.sendMessage(
		        {
		            type:type,
		            msg:msg
		        }
		    );
		};

		this.on_start = function(stored_data){
			console.log(stored_data.card_titles.length);
			self.init_app_events();

			console.log(self.prefixPattern);
			if(stored_data.card_titles && stored_data.card_titles.length){
				for (var i = stored_data.card_titles.length - 1; i >= 0; i--) {
					// remove html encoding from string
					stored_data.card_titles[i].title  = stored_data.card_titles[i].title.replace(/<[^>]*>/g, "");
				}
				self.sc_data_space.card_titles = stored_data.card_titles;
			}

			if(stored_data.frameview_titles && stored_data.frameview_titles.length){
				for (var i = stored_data.frameview_titles.length - 1; i >= 0; i--) {
					// remove html encoding from string
					stored_data.frameview_titles[i].title  = stored_data.frameview_titles[i].title.replace(/<[^>]*>/g, "");
				}
				self.sc_data_space.frameview_titles = stored_data.frameview_titles;
			}

			if(stored_data.thisframeview_ids){
				self.sc_data_space.thisframeview_ids = stored_data.thisframeview_ids;
			}

			if(self.cardTitleSearchEngine){
				self.cardTitleSearchEngine.clear();
				self.cardTitleSearchEngine = null;
			}
			if(self.frameviewSearchEngine){
				self.frameviewSearchEngine.clear();
				self.frameviewSearchEngine = null;
			}

			self.cardTitleSearchEngine = new Bloodhound({
			    local: self.sc_data_space.card_titles,
			    identify: function(obj) { return obj.id; },
			    queryTokenizer: Bloodhound.tokenizers.whitespace,
			    datumTokenizer: Bloodhound.tokenizers.obj.whitespace('title'),
			});
			 	
			self.frameviewSearchEngine = new Bloodhound({
			    local: self.sc_data_space.frameview_titles,
			    identify: function(obj) { return obj.id; },
			    queryTokenizer: Bloodhound.tokenizers.whitespace,
			    datumTokenizer: Bloodhound.tokenizers.obj.whitespace('title'),
			});

		}

		// at last singletons

		return self;// return an object instead of the function to make it singleton
	}

	return interpreter();
});