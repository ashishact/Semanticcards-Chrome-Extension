	var prefixMapping = {
		"foaf": "http://xmlns.com/foaf/0.1/",
		"rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
		"rdfs": "http://www.w3.org/2000/01/rdf-schema#",
		"xsd": "http://www.w3.org/2001/XMLSchema#",
		"dbo": "http://dbpedia.org/ontology/",
		"dbr": "http://dbpedia.org/resource/",
		"dbp": "http://dbpedia.org/property/",
		"owl": "http://www.w3.org/2002/07/owl#",
		"skos": "http://www.w3.org/2004/02/skos/core#",
		"purl": "http://purl.org/dc/terms/",
	}

	var tripplestore = new Triplestore();
	tripplestore.setMapping("foaf", "http://xmlns.com/foaf/0.1/");
	tripplestore.setMapping("rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#");
	tripplestore.setMapping("rdfs", "http://www.w3.org/2000/01/rdf-schema#");
	tripplestore.setMapping("xsd", "http://www.w3.org/2001/XMLSchema#");
	tripplestore.setMapping("dbo", "http://dbpedia.org/ontology/");
	tripplestore.setMapping("dbr", "http://dbpedia.org/resource/");
	tripplestore.setMapping("owl", "http://www.w3.org/2002/07/owl#");
	tripplestore.setMapping("skos", "http://www.w3.org/2004/02/skos/core#");
	tripplestore.setMapping("purl", "http://purl.org/dc/terms/");

	tripplestore.setMapping("scards", "http://semanticcards.org/");



	function roughSizeOfObject( object ) {

	    var objectList = [];
	    var stack = [ object ];
	    var bytes = 0;

	    while ( stack.length ) {
	        var value = stack.pop();

	        if ( typeof value === 'boolean' ) {
	            bytes += 4;
	        }
	        else if ( typeof value === 'string' ) {
	            bytes += value.length * 2;
	        }
	        else if ( typeof value === 'number' ) {
	            bytes += 8;
	        }
	        else if
	        (
	            typeof value === 'object'
	            && objectList.indexOf( value ) === -1
	        )
	        {
	            objectList.push( value );

	            for( var i in value ) {
	                stack.push( value[ i ] );
	            }
	        }
	    }
	    var kb = bytes/1024;
	    return kb;
	}

	function sims(query){
		var endpoint = 'http://dbpedia.org/sparql';
		if(!query) query = "SELECT ?s WHERE {?s ?p ?o} LIMIT 10";
		var queryUrl = endpoint + "?query="+ encodeURIComponent(query) +"&format=json";
		$.ajax({
			dataType: 'json',
			url: queryUrl,
			success: function(data) {
				if(data.results){
					// console.log(JSON.stringify(data.results.bindings));
					console.log(data.results.bindings);
				}
				else console.log(data);
			}
		});
	}


	var SemanticWeb = function(){
		var self = this;

		this.analysedSentences = []; 
		this.tokenStrings = [];
		this.rootToken = '';// token is a list of words here 
		this.rootTags = ''// tags for first sentence// 'DT NN WP'
		this.andSplits = [];
		this.dotSplit = [];
		//__________________________________________________
		// => => => 				}						|
		// => => => =>				}						|
		// => => => => => 			} Prev Context stacks 	|
		// => => => => => => 	 	}						|
		// => => => => => => => 	}						|
		// 													|
		// => => => => => => => => 	} contextStack 			|
		// 						|							|
		// 						|							|
		// 						|_____ Current Context 		|
		//													|
		//__________________________________________________|								
		
		

		this.OAPI = {
			DBP_LKUP_PREFIX:1,
			DBP_LKUP_KEYWORD:2,
			DBP_SPARQL:3,
			WIKIPEDIA_PREFIX:4,
			GOOGLE_PREFIX:5,
		}
		
		this.tab_id = 0;

		this.searchDelim = '"';
		this.searchIdDelim = '~';

		// this.queryAnswers = {};// term_id:{id:term_id, answers:[{title:'String', desc:'', thumb_source}, {}]}
		this.queryAnswers = {};//{id:term_id, answers:[uri, uri...]}

		this.queryQuestions = {};// term_id:{id:term_id, question:'what is solar system', count:1}
		this.questionSearchStringSource = '';// '"234 who is barack obama""12 why is sea not green"......'
											// id:234 => this id is question id, and even present in answer id
		
		this.predicates = [];
		this.predicatesString = '';
		this.subjects = [];
		this.subjectsString = '';


		this.createSparql = function(){
			var me = this;
			this.limitForClassObject = 10;// will have many predicates
			this.limitForAllPredicate = 200;
			this.limitForInstanceObject= 20;// will have only one predicate
			this.limitForAllClassPredicate = 400;

			this.results = function(json){
				console.log('sparql results', json);
				if(json.head && json.head.vars && json.head.vars.length){
					if(json.head.vars.length > 0){
						// only one variable asked
						var variable = json.head.vars[0];
						console.log('variable is: ',variable);
						if(variable.indexOf('allPredicate') ===0){
							var sparqlid = variable.split('allPredicate')[1];// id to determine who made this sparql call
							if(json.results.bindings && json.results.bindings.length){
								var res = json.results.bindings;
								var predicatesUri = [];
								for (var i = 0; i < res.length; i++) {
									var predicate = res[i][variable].value;
									predicatesUri.push(predicate);
								}
								console.log('calling back with sparql results for all predicates');
								self.prepareContextStack({sparqlid:sparqlid, predicates: predicatesUri, type:'allPredicate'})
							}
							else{
								console.log('0 results from sparql');
								self.prepareContextStack({sparqlid:sparqlid, predicates: [], type:'allPredicate', status:'zeroresults'})
							}
						}
						else if(variable.indexOf('classInstances') ===0){
							var sparqlid = variable.split('classInstances')[1];
							if(json.results.bindings && json.results.bindings.length){
								var res = json.results.bindings;
								var classInstances = [];
								for (var i = 0; i < res.length; i++) {
									classInstances.push(res[i][variable]);
								}
								console.log('calling back with sparql results for class objects');
								self.prepareClassContextStack({sparqlid:sparqlid, classInstances: classInstances, type:'classInstances'});
							}
						}
						else if(variable.indexOf('objectSuggForClass') ===0){
							var sparqlid = variable.split('objectSuggForClass')[1];
							if(json.results.bindings && json.results.bindings.length){
								var res = json.results.bindings;
								var objectSuggForClass = [];
								for (var i = 0; i < res.length; i++) {
									objectSuggForClass.push(res[i][variable]);
								}
								console.log('calling back with sparql results for class objects');
								self.prepareClassContextStack({sparqlid:sparqlid, objectSuggForClass:objectSuggForClass, type:'objectSuggForClass'});
							}
						}
						else if(variable.indexOf('object') ===0){// this should be below objectSuggForClass 
							//as it wil  match with object
							var sparqlid = variable.split('object')[1];// id to determine who made this sparql call
							if(json.results.bindings && json.results.bindings.length){
								var res = json.results.bindings;
								var objs = [];
								for (var i = 0; i < res.length; i++) {
									objs.push(res[i][variable]);
								}
								console.log('calling back with sparql results for objects');
								self.prepareContextStack({sparqlid:sparqlid, objs:objs, type:'object'})
							}
						}
						else if(variable.indexOf('allClassPredicates') === 0){
							var sparqlid = variable.split('allClassPredicates')[1];// id to determine who made this sparql call
							if(json.results.bindings && json.results.bindings.length){
								var res = json.results.bindings;
								var predicates = [];
								for (var i = 0; i < res.length; i++) {
									var predicate = res[i][variable];
									predicates.push(predicate);
								}
								console.log('calling back with sparql results for all class predicates');
								self.sparqlEvent.trigger(sparqlid, {sparqlid:sparqlid, predicates: predicates, type:'allClassPredicates'})
							}
							else{
								console.log('0 results from sparql');
								self.sparqlEvent.trigger(sparqlid, {sparqlid:sparqlid, predicates: [], type:'allClassPredicates'})
							}
						}
						else if(variable.indexOf('facetedClassObjects') === 0){
							var sparqlid = variable.split('facetedClassObjects')[1];// id to determine who made this sparql call
							if(json.results.bindings && json.results.bindings.length){
								var res = json.results.bindings;
								var objects = [];
								for (var i = 0; i < res.length; i++) {
									var object = res[i][variable];
									object.label = res[i]['label'].value;
									objects.push(object);
								}
								console.log('calling back with sparql results for facetedClassObjectss');
								self.sparqlEvent.trigger(sparqlid, {sparqlid:sparqlid, objects: objects, type:'facetedClassObjects'})
							}
							else{
								console.log('0 results from sparql');
								self.sparqlEvent.trigger(sparqlid, {sparqlid:sparqlid, objects: [], type:'facetedClassObjects'})
							}
						}
						else{
							console.log('no variable matched , in sparql results');

							
						}
						
					}
				}
						

			}
			this.endpoint = 'http://dbpedia.org/sparql';
			this.queryEndpoint = function(query){
				if(!query || !(query.length>3))return;
				var queryUrl = me.endpoint + "?query="+ encodeURIComponent(query) +"&format=json";
				$.ajax({
					dataType: 'json',
					url: queryUrl,
					success: function(json) {
						if(json.results){
							me.results(json);
							// console.log(json);
						}
						else console.log(json);
					}
				});
			};

			this.constructQuery = function(prefixes, variables, tripples, filters,  limit, offset){
				var prefixStr = '';
				for (var i = 0; i < prefixes.length; i++) {
					if(prefixes[i]) prefixStr+= 'PREFIX '+prefixes[i]+': <'+ prefixMapping[prefixes[i]] + '>  ';
				}
				var variableStr = variables.join(' ');
				var selectStr = 'SELECT DISTINCT ' + variableStr + ' WHERE { ';
				var trippleStr = '';
				for (var i = 0; i < tripples.length; i++) {
					trippleStr+= tripples[i].s +' '+ tripples[i].p + ' ' + tripples[i].o + ' . ';
				}
				var filterStr = (filters && filters.length ) ? filters.join(' . ') : '';

				var qu = prefixStr + selectStr + trippleStr + filterStr + ' } ' + 'LIMIT '+limit;
				if(offset) qu+= ' OFFSET '+ offset;

				return qu;

			};


			this.getEnglishAbstract = function(name){
				var qu = 'PREFIX owl: <http://www.w3.org/2002/07/owl#>\
							PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\
							PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\
							PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\
							PREFIX foaf: <http://xmlns.com/foaf/0.1/>\
							PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\
							PREFIX dbpedia: <http://dbpedia.org/ontology/>\
							PREFIX dbpprop: <http://dbpedia.org/property/>\
							PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>'+
								'SELECT DISTINCT ?abs WHERE {\
	  								?x0 rdf:type foaf:Person.\
	  								?x0 rdfs:label "'+name+'"@en.\
	  								?x0 dbpedia-owl:abstract ?abs.\
									FILTER(!isLiteral(?abs) || lang(?abs) = "" || langMatches(lang(?abs), "EN"))\
								} LIMIT 1';
				qu = qu.replace(/\s+/g, " ");
				me.queryEndpoint(qu);
			};

			this.getAllEnglishPredicate = function(s, id){// s is a $rdf Named node
				s = '<'+s+'>';
				var qu = 'SELECT DISTINCT ?allPredicate'+id+' WHERE {'+s+' ?allPredicate'+id+' ?o.} LIMIT 200';
				console.log(qu);
				me.queryEndpoint(qu);
			};

			this.getObject = function(s, p, id){
				s = '<'+s+'>';
				p = '<'+p+'>';
				o = '?object'+id;
				var qu = 'SELECT DISTINCT ?object'+id+' WHERE {'+s+' '+p+' '+o+'. FILTER(!isLiteral('+o+') || lang('+o+') = "" || langMatches(lang('+o+'), "EN")) } LIMIT 50';
				console.log(qu);
				me.queryEndpoint(qu);
			}

	
			this.getclassInstances = function(OC, OP, o, id){
				var qu = 'PREFIX owl: <http://www.w3.org/2002/07/owl#>\
							PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\
							PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\
							PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\
							PREFIX dbr: <http://dbpedia.org/resource/>\
							PREFIX dbo: <http://dbpedia.org/ontology/>\
							PREFIX dbpprop: <http://dbpedia.org/property/>'+
								'SELECT DISTINCT ?classInstances'+id+' WHERE {\
	  								?classInstances'+id+' a '+OC+'.\
	  								?classInstances'+id+' '+OP+' '+o+'.\
								} LIMIT 13';
				console.log(qu);
				me.queryEndpoint(qu);
			};

			this.getObjectsGivenClassAndPredicate = function(OC, OP, id){
				var qu = 'PREFIX owl: <http://www.w3.org/2002/07/owl#>\
							PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\
							PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\
							PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\
							PREFIX dbr: <http://dbpedia.org/resource/>\
							PREFIX dbo: <http://dbpedia.org/ontology/>\
							PREFIX dbpprop: <http://dbpedia.org/property/>'+
								'SELECT DISTINCT ?objectSuggForClass'+id+' WHERE {\
	  								?instance a '+OC+'.\
	  								?instance ' +OP+' ?objectSuggForClass'+id+'.\
								} LIMIT 13';
				console.log(qu);
				me.queryEndpoint(qu);
			};

			this.getObjectsGivenClassAndPredicateAndPartialObject = function(OC, OP, ostr, id){
				var qu = 'PREFIX owl: <http://www.w3.org/2002/07/owl#>\
							PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\
							PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\
							PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\
							PREFIX dbr: <http://dbpedia.org/resource/>\
							PREFIX dbo: <http://dbpedia.org/ontology/>\
							PREFIX dbpprop: <http://dbpedia.org/property/>'+
								'SELECT DISTINCT ?objectSuggForClass'+id+' WHERE {\
	  								?instance a '+OC+'.\
	  								?instance ' +OP+' ?objectSuggForClass'+id+'.\
	  								?objectSuggForClass'+id+' rdfs:label ?label.\
	  								FILTER regex(str(?label), \''+ostr+'\', \'i\')\
								} LIMIT 13';
				console.log(qu);
				me.queryEndpoint(qu);
			};

			this.getShortDescOfObjects = function(resourceuris, id){
				// allquery = [];
				// for (var i = 0; i < resourceuris.length; i++) {
				// 	allquery.push(' { s dbpprop:shortDescription shortDescription'+id+' . s dbo:thumbnail thumbnail'+id+' }');
				// }
				// allquery = allquery.join(' union ');

				// var qu = 'PREFIX owl: <http://www.w3.org/2002/07/owl#>\
				// 			PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\
				// 			PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\
				// 			PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\
				// 			PREFIX dbr: <http://dbpedia.org/resource/>\
				// 			PREFIX dbo: <http://dbpedia.org/ontology/>\
				// 			PREFIX dbpprop: <http://dbpedia.org/property/>'+
				// 				'SELECT DISTINCT ?shortDescription'+id+' ?thumbnail'+id+' WHERE {\
	  	// 							?classObject'+id+' a '+OC+'.\
	  	// 							?classObject'+id+' '+OP+' '+o+'.\
				// 				} LIMIT 5';
				// console.log(qu);
				// me.queryEndpoint(qu);
			}

			// this.getContentForCard = function(s, types){// s must be dbr
			// 	s = '<'+s+'>';
			// 	p = '<'+p+'>';
			// 	o = '?object'+id;
			// 	var qu = 'SELECT DISTINCT ?object'+id+' WHERE {'+s+' '+p+' '+o+'. FILTER(!isLiteral('+o+') || lang('+o+') = "" || langMatches(lang('+o+'), "EN")) } LIMIT 50';
			// 	console.log(qu);
			// 	me.queryEndpoint(qu);	
			// }

			return this;
		}
		this.sparql = self.createSparql();

		this.createHiddenWeb = function(){
			var me = this;

			this.last_query = '';
			this.last_answers = null;
			this.getFactbitesResults = function(query, tab_id){
				
				var match = query.match(/([\w\s]+)(\.+)$/);
				if(match){
					var no_of_dot = match[2].length;
					var answers = [];

					if((match[1] == me.last_query) &&  me.last_answers){
						if(no_of_dot*4 < me.last_answers.length){
							self.sendHiddenwebAnsewersFactbites(me.last_answers.slice(4*(no_of_dot-1), 4*(no_of_dot)));
						}
							
						return;
					}

					me.last_query  = match[1];

					$.get('http://www.factbites.com/topics/'+query,
						function(data){
							var ans = {}
							var elems = $.parseHTML(data);
							var topicFound = false;
							$.each(elems, function(i, item){
								if(item.nodeName === 'TABLE'){
									if(topicFound){
										var node = $(item).find('tbody');
										var cl = node.find('td');
										$.each(cl, function(j, n){
											text = $(n).text();
											if(text.length < 10) $(n).remove();
											if(text.match(/words\)/) && text.match(/^\s*(http|www|en.wiki)/)){
												console.log(text);
												$(n).remove();
											}
											var $i = $(n).find('i');// Site not responding. Last check: 2007-11-07)
											if($i)$i.remove();

										})
										node.find('a').each(function(e) {
											var l = $(this).attr('href');
											// $(this).css('color', 'initial');
											// $(this).css('textDecoration', 'initial');
											
											if(l.indexOf('/topics') === 0) $(this).attr('href', 'http://www.factbites.com'+l);
										})
										if(node.text().length> 10) answers.push({html:node.html()});
									}
									else{
										if($(item).text().indexOf('Topic:') > -1) topicFound = true;
									}
								}
							})
							me.last_answers = answers;
							if(no_of_dot==1){
								self.sendHiddenwebAnsewersFactbites(answers.slice(0, 4));
							}
						}
					)
				}
			}
			return this;
		}
		this.hiddenweb = self.createHiddenWeb();
		// this.gotAllPredicates = function(predicatesUri, predicateNameArray){
		// 	self.context.predicates = predicatesUri;
		// 	for (var i = 0; i < predicateNameArray.length; i++) {
		// 		var name = predicateNameArray[i];
		// 		self.co ntext.predicateSearchString+= self.searchDelim + i + self.searchIdDelim + name + self.searchDelim;
		// 	}
		// };
		
		this.createSparqlEvent = function(){
			var me = {};
			me.mappings = {};
			me.trigger = function(id, data){
				var dest = me.mappings[id];
				if(dest && dest.callback && dest.context){
					dest.callback(id, data, dest.context);
					delete me.mappings[id];
				}
			}
			me.store = function(id, dest){
				me.mappings[id] = dest;
			}
			return me;
		};
		this.sparqlEvent = createSparqlEvent();
		this.getPrefixed = function(iri){
			var match = iri.match(/(.+[\/#])(.+)$/);
			if(match){
				var ks = Object.keys(prefixMapping);
				for (var i = 0; i < ks.length; i++) {
					var k = ks[i];
					var v = prefixMapping[k];
					if(match[1] === v){
						return k+':'+match[2];
					}
				}
				
			}
		}
		this.createExploratorySearch = function(){
			var me = {}
			me.currentPredicates = [];
			me.trippleStack = [];
			me.sparqlStack = [];
			me.contextStack = [];
			me.timeoutObj = null;
			me.start = function(param){
				for (var i = 0; i < self.andSplits.length; i++) {
					var sentence = self.andSplits[i][0];
					var tokens = sentence.split(' ');
					var tokl = tokens.length;
					var lastand = (i==self.andSplits.length-1);
					var CS = me.contextStack[i];
					var isfullstop = (sentence.indexOf('.') > -1 && sentence.indexOf('.') > sentence.length-2);
					if(i == 0){
						if(!CS.class.built && tokl>1){
							var cstr = tokens[1];
							me.suggestClasses(cstr, i, (lastand && tokl==2));
						}
						if(!CS.predicate.built && tokl>2){
							var pstr = tokens[2];
							me.suggestPredicates(pstr, i,  (lastand && tokl ==3))
						}
						if(!CS.object.built && tokl>3){
							var ostr = tokens.slice(3, tokens.length).join(' ');
							console.log(ostr);
							var timeIn = 1000;
							if(!ostr.length)timeIn = 0;// immediately act if only space at end
							clearTimeout(me.timeoutObj);
							function timedFunction(){
								me.callSparql(ostr);
							}
							me.timeoutObj = setTimeout(timedFunction, timeIn);

						}
					}
				}

			};

			me.suggestClasses = function(str, contextidx, send_to_ui){
				self.currentSuggestedClass = {}
				var selectediri = null;
				var classes = ontology.getMatchedClasses(str);
				var bestMatch = -200;
				for (var i = 0; i < classes.length; i++) {
					var _tok = classes[i].split(ontology.searchIdDelim);
					var k = _tok[0];
					var c = _tok[1];
					var l = c.substr(4, c.length).toLowerCase();
					var matchFactor = l.length ? str.length/l.length : 0;
					var paddingMatch = l.indexOf(str.toLowerCase());
					var totMatch = matchFactor - paddingMatch;
					if(totMatch > bestMatch){
						bestMatch = totMatch;
						self.currentSuggestedClass.iri = c;
						self.currentSuggestedClass.key = k;
						selectediri = c;
						if(str.toLowerCase() === l)	break;
					}
				}
				me.contextStack[contextidx].class.iri = selectediri;
				me.contextStack[contextidx].class.built = true;


				if(send_to_ui){
					self.classSuggestionsHtml = '';
					for (var i = 0; i < classes.length; i++) {
						var c = classes[i].split(ontology.searchIdDelim)[1];
						var l = c.substr(4, c.length);
						var chref = 'dbo:'+ l
						var chtml = '<a data-class=\'true\' style=\'color:inherit;\' href=\''+chref+'\' target=\'_blank\' title=\''+chref+'\'>'+l+'</a>';
						if(self.currentSuggestedClass.iri === c){
							chtml = chtml.replace('color:inherit', 'color:forestgreen');
							self.classSuggestionsHtml = chtml +'&nbsp; '+ self.classSuggestionsHtml;
						}
						else{
							self.classSuggestionsHtml+= '&nbsp; '+chtml;
						}
					}
					self.sendClassSuggestion(self.classSuggestionsHtml);
				}
			}
			me.suggestPredicates = function(str, contextidx, send_to_ui){
				var c = me.contextStack[contextidx].class;
				var objects = tripplestore.getValues(c.iri, self.ALL_PREDICATES_URI);
				if(objects.length && objects[0].length>2){
					console.log('predicates exist');
					var ps = objects[0];
					str = str.toLowerCase();
					var selected = ps[0].value
					var bestMatch = -200;
					for (var i = 0; i < ps.length; i++) {
						var p = ps[i].value;
						var match = p.match(/^\w+:(\w+)$/);
						if(!match) match = p.match(/.+[\/#](.+)$/);
						if(match){
							var l = match[1].toLowerCase();
							if(l.indexOf(str)>-1){
								var matchFactor = l.length ? str.length/l.length : 0;
								var paddingMatch = l.indexOf(str);
								var totMatch = matchFactor - paddingMatch;

								if(totMatch > bestMatch){
									bestMatch = totMatch;
									selected = p;
									if(str === l)	break;
								}
							}
						}
					}
					me.contextStack[contextidx].predicate.iri = selected;
					me.contextStack[contextidx].predicate.built = true;

					if(send_to_ui){
						self.predicateSuggestionsHtml = '';

						for (var i = 0; i < ps.length; i++) {
							var p = ps[i].value;
							var match = p.match(/^\w+:(\w+)$/);
							if(!match) match = p.match(/.+[\/#](.+)$/);
							if(match){
								var l = match[1].toLowerCase();
								if(l.indexOf(str)>-1){
									var chref = p;
									var title = p
									var chtml = '<a data-class=\'true\' style=\'color:inherit;\' href=\''+chref+'\' target=\'_blank\' title=\''+title+'\'>'+l+'</a>';
									if(selected === p){
										chtml = chtml.replace('color:inherit', 'color:forestgreen');
										self.predicateSuggestionsHtml = chtml +'&nbsp; '+ self.predicateSuggestionsHtml;
									}
									else{
										self.predicateSuggestionsHtml+= '&nbsp; '+chtml;
									}
								}
							}
						}
						self.sendPredicateSuggestion(self.predicateSuggestionsHtml);
					}
				}
				else{
					if(!me.contextStack[contextidx].predicate.count)me.contextStack[contextidx].predicate.count=0;
					me.contextStack[contextidx].predicate.count++;
					if(me.contextStack[contextidx].predicate.count<2) me.getAllClassPredicates(c, contextidx);
					else console.log('previously query was made');
				}
			}
			me.getAllClassPredicates = function(c, contextidx){
				if(!c.iri)return;
				var id = Date.now();
				var prefixes = ['dbo'];
				var allcp = '?allClassPredicates'+ id;
				var variables = [allcp];
				var tripples = [{s:'?instance', p:'a', o:c.iri}, {s:'?instance', p:allcp, o:'?object'}];
				var filters = [];
				var limit = 200;
				var offset = null;
				var qu = self.sparql.constructQuery(prefixes, variables, tripples, filters, limit, offset);
				console.log(qu);

				self.sparqlEvent.store(id, {callback:me.gotAllClassPredicates, context:{c:c, idx:contextidx}});
				self.sparql.queryEndpoint(qu);
			};
			me.gotAllClassPredicates = function(id, param, context){
				// console.log('got ', param.predicates);

				for (var i = 0; i < param.predicates.length; i++) {
					if(param.predicates[i].type == 'uri'){
						var iri = param.predicates[i].value;
						var prefixediri = self.getPrefixed(iri);
						if(prefixediri) param.predicates[i].value = prefixediri;
					}
				}
				tripplestore.set(context.c.iri, self.ALL_PREDICATES_URI, param.predicates);

				me.start();
			};
			me.callSparql = function(ostr, contextidx){
				var c = me.contextStack[0].class; if(!c.iri)return;
				var p = me.contextStack[0].predicate; if(!p.iri)return; if(p.iri.match(/http/))p.iri = '<'+p.iri+'>';

				var id = Date.now();
				var prefixes = ['dbo', 'rdfs'];
				var obj = '?facetedClassObjects'+ id;
				var variables = [obj, '?label'];
				var tripples = [{s:'?instance', p:'a', o:c.iri}, {s:'?instance', p:p.iri, o:obj}, {s:'?instance', p:'rdfs:label', o:'?label'}];
				var filters = [];
				if(ostr.replace(/\s+/g,' ').length>1) filters.push('FILTER regex(str('+obj+'), \''+ostr+'\', \'i\')');
				filters.push('FILTER(!isLiteral(?label) || lang(?label) = "" || lang(?label) = "en" || langMatches(lang(?label), "EN"))');
				var limit = 20;
				var offset = null;
				var qu = self.sparql.constructQuery(prefixes, variables, tripples, filters, limit, offset);
				console.log(qu);

				self.sparqlEvent.store(id, {callback:me.gotfacetedClassObjects, context:{c:c, p:p, idx:contextidx} });
				self.sparql.queryEndpoint(qu);
				
			};
			me.getInstances = function(){

			}
			me.gotfacetedClassObjects = function(id, param, context){
				var answers = [];
				for (var i = 0; i < param.objects.length; i++) {
					var iri = param.objects[i].value;
					if(iri.length > 4){// 'dbo:', can be * as well
						var prefixediri = self.getPrefixed(iri);
						if(prefixediri) param.objects[i].value = prefixediri;

						if(prefixediri) answers.push({desc:param.objects[i].label, title:prefixediri.split(':')[1].replace('_', ' ')});
						else answers.push({desc:param.objects[i].label, title:param.objects[i].value});
					}
				}
				if(context.idx < me.contextStack.length){
					me.contextStack[context.idx].object.iri = param.objects[0].value;
					me.contextStack[context.idx].object.built = true;
				}
				self.sendClassObjectSuggestions(answers);

			}

			return me;
		}
		this.explore = self.createExploratorySearch();
		this.gotNewTripplesFromPrefixSearch = function(tripples){
			//Note !
			//Here only one objct for any s,p pair alllowed
			//so if anything exists then no need to add it

			for (var i = 0; i < tripples.length; i++) {
				var tr = tripples[i];
				var objects = tripplestore.getValues(tr.s, tr.p);
				if(objects.length){
					// console.log('value already exist', tr.s, tr.p, objects);
					// no need to check if it is the same object , because only one value is allowed here
				}
				else{
					tripplestore.add(tr.s, tr.p, tr.o);						
				}
			}

			var allsl = tripplestore.getSubjects().length;
			var allpl = tripplestore.getProperties().length;
			var allvl = tripplestore.getValues().length;
			if(allvl > 10000 || allsl > 10000 || allpl > 10000){
				console.log('too much cache, removing all ');
				tripplestore.remove();
			}
		};
	

		this.processAndSendAnswers = function(){

			var answers = [];
			var cs = self.contextStack;
			var uiid = 0;

			for (var i = 0; i < cs.length; i++) {
				var ans = {};
				var ctx = cs[i];

				var ppredicate = ctx.parentPredicate;
				if(ppredicate){
					var match = ppredicate.match(/.+[\/#](.+)$/);
					if(match)answers.push({desc:'<a data-predicate=\'true\' href=\''+ppredicate+'\' target=\'_blank\' title=\''+ppredicate+'\'>'+match[1]+'</a><i style=\'margin-left:10px;\' class=\"fa fa-arrow-down\"></i>'});
				}


				var lastContext = (cs.length-1 === i);
				var subjects = [];
				if(lastContext){
					if(ctx.subjects) subjects = ctx.subjects;
				}
				else{
					if(ctx.subject) subjects = [ctx.subject];
				}

				for (var j = 0; j < subjects.length; j++) {
					ans = {};
					var s = subjects[j];
					if(s){
						var isuri = (s.match(/^https?:\/\//));
						var isdbr = (s.match(/http:\/\/dbpedia\.org\/resource\//));
						var isimg = (s.match(/\.(jpg|png|gif|svg|JPG)$/));
						var isdbpthumb = (s.match(/\.(jpg|png|gif|svg|JPG)\?width=/));
						
						if(isuri){
							if(isdbpthumb){
								ans.desc = '<img style=\'width:50%;\' src=\''+s+'\'>';
							}
							else if(isimg){
								ans.desc = '<img style=\'width:50%;\' src=\''+s+'\'>';
							}
							else if(isdbr){
								var os = tripplestore.getValues(s, 'rdfs:label');
								if(os.length){
									var o = os[0];
									ans.title = o;
								}
								else{
									m = s.match(/.+[\/#](.+)$/);
									if(m){
										ans.title = m[1].replace(/_/g, ' ');
									}
									else{
										ans.title = s.replace(/_/g, ' ');
									}
								}
								

								os = tripplestore.getValues(s, 'scards:termDescription');
								if(os.length){
									ans.desc = os[0];
								}

								os = tripplestore.getValues(s, 'dbo:thumbnail');
								if(os.length){
									ans.thumb_source = os[0];
								}

							}
							else{
								m = s.match(/.+[\/#](.+)$/);
								if(m){
									ans.title = m[1].replace(/_/g, ' ');
								}
								else{
									ans.title = s.replace(/_/g, ' ');
								}
							}
						}
						else if(typeof(s) === 'string'){
							ans.title = s.replace(/_/g, ' ');
						}
					}
					else{
						ans.desc = 'subject or object doesn\'t exist!!!!!';
					}
					
					if(lastContext || (i===cs.length-2 && !cs[cs.length-1].subject)){
						ans.iscontext = true;
						ans.id = uiid;
						uiid++;
					}
					answers.push(ans);
				}

				if(ctx.object){// probably its not a resources , but a string or value
					ans.desc = ctx.object;
					answers.push(ans);
				}

			}

			// if(termSuggestions.length)answers.push({desc:'<div style=\'width:500px; opacity:0.6; border-width:2px;\' class=\'hline\'></div>'});

			lastPPredicate = _.last(cs).parentPredicate;
			var predicateSuggestions = '';
			for (var i = 0; i < termSuggestions.length; i++) {
				var s = termSuggestions[i];

				if(typeof(s)==='string'){
					var isuri = (s.match(/^https?:\/\//));
					var isdbr = (s.match(/http:\/\/dbpedia\.org\/resource\//));
				}
				
				if(s.desc){// predicate suggestion as desc
					if(s.desc.indexOf(lastPPredicate) > -1){
						predicateSuggestions+= ' &nbsp; <span style=\'color:forestgreen;\'>'+s.desc+'</span>';
					}
					else predicateSuggestions+= '&nbsp; ' + s.desc;
				}
			}
			if(predicateSuggestions.length > 3){
				answers.push({desc:predicateSuggestions});
			}
				
			

			self.sendAnswers(answers);

		};

		this.onlineSearchReply = {
			gotGoogleSuggestions: function(json, term_id){
				
				if(!json.CompleteSuggestion)return;
				self.queryAnswers = [];
				$.each(json.CompleteSuggestion, function(i, item){
					var title = item.suggestion.data;
					if(title)self.queryAnswers.push({title:title, desc:''});
				});

				// self.sc_holdder_ref.emit_valid_commands_changed();
			},
			gotWikipediaSuggestions: function(json, term_id){
				// console.log(json);	

				if(json.query && json.query.pages){
					var tripples = [];
					var answers = [];
				    $.each(json.query.pages, function(i,item){
				    	if(item.title){
				    		var _url = self.getDbpediaUrl(item.title);
				        	var s = _url
				        	var p = 'rdfs:label';
				        	var o = item.title;

				        	tripples.push({s:s, p:p, o:o});

					    	if(item.thumbnail && item.thumbnail.source){
					    		p = 'dbo:thumbnail';
					    		o = item.thumbnail.source;
				        		tripples.push({s:s, p:p, o:o});
					    	}

					    	if(item.terms && item.terms.description && item.terms.description.length){
						    	p = 'scards:termDescription';
						    	o = item.terms.description[0];
				        		tripples.push({s:s, p:p, o:o});
					    	}
					    	answers.push(s);
				    	}
				    });
				    self.gotNewTripplesFromPrefixSearch(tripples);
				    self.queryAnswers[term_id] = {id:term_id, answers:answers, type: 'subject suggestions'};// answer:[NamedNode], type:'subject suggestions'
				    var question_type = self.queryQuestions[term_id].type;
				    if(question_type === 'pcc object suggestions'){
				    	self.prepareClassContextStack();
				    }
				    else if(question_type === 'pc subject suggestions'){
				    	self.prepareContextStack();
				    }
				}
			},
			gotWikipediaShortdescriptionsAndThumbnails: function(json, action_id){
				if(json.query && json.query.pages){
					var tripples = [];
				    $.each(json.query.pages, function(i,item){
				    	if(item.title){
				    		var _url = self.getDbpediaUrl(item.title);
				        	var s = _url
				        	var p = 'rdfs:label';
				        	var o = item.title;

				        	tripples.push({s:s, p:p, o:o});

					    	if(item.thumbnail && item.thumbnail.source){
					    		p = 'dbo:thumbnail';
					    		o = item.thumbnail.source;
				        		tripples.push({s:s, p:p, o:o});
					    	}

					    	if(item.terms && item.terms.description && item.terms.description.length){
						    	p = 'scards:termDescription';
						    	o = item.terms.description[0];
				        		tripples.push({s:s, p:p, o:o});
					    	}
				    	}
				    });
				    self.gotNewTripplesFromPrefixSearch(tripples);
				    self.prepareClassContextStack({type:'wikipedia_shortdescriptions_and_thumbnails', action_id:action_id});
				}
			},
			gotUmbelConcept: function(json, term_id){
				if(!json.results) return;
				console.log(json);
				self.queryAnswers = [];
				$.each(json.results, function(i, item){
				    _tok = item['pref-label'];
				    // console.log(_tok);
				    if(_tok)self.queryAnswers.push({title:_tok, desc:item.description});
				});

				// self.sc_holdder_ref.emit_valid_commands_changed();
			},
			gotDuckDuckGoSuggestions : function(json, term_id){
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
				// self.sc_holdder_ref.emit_valid_commands_changed();
			},

			gotDbpediaLookupSuggestions: function(json, term_id){
				console.log(json);
				self.queryAnswers = [];
				if(json.results && json.results.length){
				    $.each(json.results, function(i, item){
				    	var classes = [];
				    	var labels = [];// finding dublicates
				    	for (var i = 0; i < item.classes.length; i++) {
				    		var l = _.last(item.classes[i].label.split('/'));// http://www.w3.org/2002/07/owl#Thing
				    		if(labels.indexOf(l)>-1) continue;

				    		labels.push(l);
				    		classes.push({label:l});
				    	}

				        self.queryAnswers.push({title:item.label, desc:item.description, classes:classes});
				    });
				}
				self.sc_holdder_ref.emit_valid_commands_changed();
			},

			gotMedlinePlusSuggestions: function(json){
				if(!json)return;

				if(json.spellingCorrection){
					self.queryAnswers = [];
					self.queryAnswers.push({title:json.term + " not found", desc:'Search for '+ json.spellingCorrection+' instead'});
					self.sc_holdder_ref.emit_valid_commands_changed();
					return;
				}

				if(!json.list || !json.list.document || !json.list.document.length)return;
				// console.log(json);

				self.queryAnswers = [];
				for (var i = 0; i < json.list.document.length; i++) {
					var conts = json.list.document[i].content;
					var bind_data = {classes:[]};
					for (var j = 0; j < conts.length; j++) {
						var name = conts[j].name;
						if(name === 'title'){
							bind_data.title = conts[j].text.replace(/<[^>]*>/g, "");
						}
						// else if(name === 'snippet'){
						else if(name === 'FullSummary'){
							// bind_data.desc = conts[j].text.replace(/<[^>]*>/g, "");
							bind_data.desc = conts[j].text.replace(/<p>/g, '<p style=\'margin-bottom:10px;\'>');
						}
						else if(name === 'groupName'){
							bind_data.classes.push({label:conts[j].text.replace(/<[^>]*>/g, "")});
						}
					}
					console.log(bind_data);
					self.queryAnswers.push(bind_data);
				}
				
				// self.sc_holdder_ref.emit_valid_commands_changed();
			},
		}
		
		this.onlineSearchQuery = {
			getGoogleSuggestions: function(question, term_id){
				searchapi.getGoogleSuggestion(question, term_id, self.onlineSearchReply.gotGoogleSuggestions);
			},
			getWikipediaSuggestions: function(question, term_id){
            	searchapi.wikipedia_suggest(question, term_id, self.onlineSearchReply.gotWikipediaSuggestions);
			},
			getWikipediaShortdescriptionsAndThumbnails: function(titles, action_id){
				searchapi.wikipedia_shortdescriptions_and_thumbnails(titles, action_id, self.onlineSearchReply.gotWikipediaShortdescriptionsAndThumbnails)
			},
			getUmbelConcept: function(question, term_id){
				searchapi.searchUmbelConcept(question, term_id, self.onlineSearchReply.gotUmbelConcept);
			},
			getDuckDuckGoSuggestions: function(question, term_id){
				searchapi.searchDuckDuckGo(question, term_id, self.onlineSearchReply.gotDuckDuckGoSuggestions)
			},
			getDbpediaLookupSuggestions: function(question, term_id){
				searchapi.searchDbpediaLookup(question, term_id, self.onlineSearchReply.gotDbpediaLookupSuggestions)
			},
			getMedlinePlusSuggestions: function(query, term_id){
				searchapi.searchMedlinePlusSuggestions(query, self.onlineSearchReply.gotMedlinePlusSuggestions);
			},
		}

		this.lastClassContextStack = null;
		this.classContextStack = null;
		this.rootTags = '';
		this.classSuggestionsHtml = '';
		this.currentSuggestedClass = {}

		this.predicateSuggestionsHtml = '';
		this.currentSuggestedPredicate = {};

		this.currentObjectSuggestions = [];
		this.prepareClassContextStack = function(param){

			var firstSentence = self.analysedSentences[0];
			var fullstop = (_.last(firstSentence.tags) === '.');

			var OC = self.currentSuggestedClass;
			var CCS = self.classContextStack;

			for (var i = 0; i < self.andSplits.length; i++) {
				if(i > CCS.predicates.length -1)CCS.predicates.push({});
				if(i > CCS.objects.length -1) CCS.objects.push({});


				if(CCS.objects[i].built) continue;

				if(!param){
					var islastand = (i === self.andSplits.length-1)
					var sentence = self.andSplits[i][0];
					var classTripplePatern = {s:null, p:null, o:null};
					if(i === 0){
						// with class
						classTripplePatern = self.selectClassTripplePatternFromStr(sentence, islastand);
						CCS.class = {raw:classTripplePatern.c, iri:self.currentSuggestedClass.iri};
					}
					else{
						var match = self.andSplits[0][0].match(/(all\s\w+\s)/i);
						if(match){
							sentence = match[1] + sentence;
							classTripplePatern = self.selectClassTripplePatternFromStr(sentence, islastand);
						}
					}

					if(classTripplePatern.p){
						var iri = self.currentSuggestedPredicate.iri;
						var dkey = self.currentSuggestedPredicate.dkey;
						var rkey = self.currentSuggestedPredicate.rkey;
						var d = (dkey && dkey.match(/0/) && ontology.dboClasses[dkey]) ? ontology.dboClasses[dkey].iri : dkey;
						var r = (rkey && rkey.match(/0/) && ontology.dboClasses[rkey]) ? ontology.dboClasses[rkey].iri : rkey;

						CCS.predicates[i] = {raw:classTripplePatern.p, iri:iri, domain:d, range:r};
					}

					if(classTripplePatern.o){
						CCS.objects[i] = {raw:classTripplePatern.o};
					}


					if(!fullstop){
						var spaceatend = sentence.match(/\s+$/);
						if(islastand && classTripplePatern.p && (!classTripplePatern.o) && spaceatend){// 'all scientist with birth place{\s}'
							// suggest all possible object
							CCS.predicates[i].sparqlid = Date.now().toString(36);
							sparql.getObjectsGivenClassAndPredicate(CCS.class.iri, CCS.predicates[i].iri, CCS.predicates[i].sparqlid);
							return;
						}
						else if(islastand && classTripplePatern.o){  //'all scientist with birth place Lon'
							// suggest possible object filter by o
							// 
							var ostr = classTripplePatern.o;
							if(false && ostr){
								var qsearch = self.onlineSearchQuery;
								var term_id = Date.now().toString(36);
								var qanswer = self.gotATermToken(term_id, ostr , 'pcc object suggestions');
								if(qanswer){
									console.log('got a term object');
									self.currentObjectSuggestions = [];
									for (var j = 0; j < qanswer.answers.length; j++) {
										self.currentObjectSuggestions.push({value:qanswer.answers[j], type:'uri'});// these are uri
									}
									self.suggestPossibleObjects(self.currentObjectSuggestions);
								}
								else{
									if(ostr){// don't get wikipedia suggestions if not enough chars	
										console.log('getting from wiki');
										qsearch.getWikipediaSuggestions(ostr, term_id);
										return;// important, as query are async . this function will be called again when data is available 
									}
								}
							}

							if(true, ostr){
								// get from sparql with regex
								CCS.predicates[i].sparqlid = Date.now().toString(36);
								sparql.getObjectsGivenClassAndPredicateAndPartialObject(CCS.class.iri, CCS.predicates[i].iri, ostr, CCS.predicates[i].sparqlid);
								return;
							}
						}
					}
					else{// fullstop
						
						if(self.currentObjectSuggestions.length){
							var o =  self.currentObjectSuggestions[0].value;// now only 0
							console.log('currentObjectSuggestions.length', self.currentObjectSuggestions.length);
						}
						else{
							o = CCS.objects[i].raw;
							console.log('current object raw', o);
						}

						if(o){
							var range = CCS.predicates[i].range;
							console.log(CCS.predicates[i]);
							var match = o.match(/.+[\/](.+)$/);
							if(range.substr(0,4) === 'xsd:'){
								o = '\"'+o+'\"'+'^^'+range;
							}
							else if(match){
								o = 'dbr:'+match[1];
							}
							else{
								o = 'dbr:'+o.replace(' ', '_');
							}

							if(o.length>3){// don't make a sparql query with less than 4 character
								console.log('getting instances');
								CCS.predicates[i].sparqlid = Date.now().toString(36);
								sparql.getclassInstances(CCS.class.iri, CCS.predicates[i].iri, o, CCS.predicates[i].sparqlid);
								return;
							}
						}
					}
				}
				else{
					console.log('param in ClassContext stack');
					if(param.type === 'classInstances'){
						if(CCS.predicates[i].sparqlid === param.sparqlid){	
							delete CCS.predicates[i].sparqlid;
							if(param.classInstances){
								CCS.classInstances = param.classInstances;
								var titles = [];
								for (var j = 0; j < param.classInstances.length; j++) {
									var uri = param.classInstances[j].value;
									var desc = tripplestore.getValues(uri, 'scards:termDescription').length;
									var thumb = tripplestore.getValues(uri, 'dbo:thumbnail').length;
									if(!desc || !thumb){
										var match = param.classInstances[j].value.match(/.+[\/](.+)$/);
										if(match)titles.push(match[1]);
									}
								}
								var action_id = 'pcc~' + Date.now().toString(36);
								CCS.predicates[i].action_id = action_id;
								if(titles.length)self.onlineSearchQuery.getWikipediaShortdescriptionsAndThumbnails(titles, action_id);
								return;
							}
						}
					}
					else if(param.type === 'wikipedia_shortdescriptions_and_thumbnails'){
						if(CCS.predicates[i].action_id === param.action_id){
							delete CCS.predicates[i].action_id;
							console.log(' got images and short descriptions');

						}
						else console.log('wikipedia_shortdescriptions_and_thumbnails, but id didn\'t match');
					}
					else if(param.type === 'objectSuggForClass'){
						if(CCS.predicates[i].sparqlid === param.sparqlid){
							delete CCS.predicates[i].sparqlid;

							if(param.objectSuggForClass){
								self.currentObjectSuggestions = param.objectSuggForClass;
								CCS.objects[i].suggestions = param.objectSuggForClass;
								CCS.objects[i].iri = CCS.objects[i].suggestions[0].value;

								var titles = [];
								for (var j = 0; j < param.objectSuggForClass.length; j++) {
									var uri = param.objectSuggForClass[j].value;
									var desc = tripplestore.getValues(uri, 'scards:termDescription').length;
									var thumb = tripplestore.getValues(uri, 'dbo:thumbnail').length;
									if(!desc || !thumb){
										var match = param.objectSuggForClass[j].value.match(/.+[\/](.+)$/);//whoat about _
										if(match)titles.push(match[1]);
									}
								}
								var action_id = 'pcc~' + Date.now().toString(36);
								CCS.predicates[i].action_id = action_id;
								if(titles.length){
									self.onlineSearchQuery.getWikipediaShortdescriptionsAndThumbnails(titles, action_id);
									return;
								}
								else{
									// not a uri
									 		
								}
							}

						}
					}
				}
			}


			if(fullstop){
				self.processAndSendClassObjectAnswers();
				console.log('full stop , sent instances to ui');
			}
			else{// end reach , must be some kind of suggestions for unfinished query
				if(CCS.objects.length && CCS.objects[CCS.objects.length-1].iri)self.suggestPossibleObjects(self.currentObjectSuggestions);
			}
		}

		this.suggestPossibleObjects = function(objects){
			var answers = [];
			for (var i = 0; i < objects.length; i++) {
				var s = objects[i].value;
				var ans = {};
				var isuri = (s.match(/^https?:\/\//));
				var isdbr = (s.match(/http:\/\/dbpedia\.org\/resource\//));
				var isimg = (s.match(/\.(jpg|png|gif|svg|JPG)$/));
				var isdbpthumb = (s.match(/\.(jpg|png|gif|svg|JPG)\?width=/));
				
				if(isuri){
					if(isdbpthumb){
						ans.desc = '<img style=\'width:50%;\' src=\''+s+'\'>';
					}
					else if(isimg){
						ans.desc = '<img style=\'width:50%;\' src=\''+s+'\'>';
					}
					else if(isdbr){
						var os = tripplestore.getValues(s, 'rdfs:label');
						if(os.length){
							var o = os[0];
							ans.title = o;
						}
						else{
							m = s.match(/.+[\/#](.+)$/);
							if(m){
								ans.title = m[1].replace(/_/g, ' ');
							}
							else{
								ans.title = s.replace(/_/g, ' ');
							}
						}
						

						os = tripplestore.getValues(s, 'scards:termDescription');
						if(os.length){
							ans.desc = os[0];
						}

						os = tripplestore.getValues(s, 'dbo:thumbnail');
						if(os.length){
							ans.thumb_source = os[0];
						}

					}
					else{
						m = s.match(/.+[\/#](.+)$/);
						if(m){
							ans.title = m[1].replace(/_/g, ' ');
						}
						else{
							ans.title = s.replace(/_/g, ' ');
						}
					}
				}
				else if(typeof(s) === 'string'){
					ans.title = s.replace(/_/g, ' ');
				}

				answers.push(ans);
			}
			self.sendClassObjectSuggestions(answers);

		};


		this.suggestPredicate = function(str, send_to_ui){
			console.log(str);
			self.currentSuggestedPredicate = {}

			var OC = self.currentSuggestedClass

			var predicates = ontology.getMatchedProperties(str, OC.key);
			var bestMatch = -200;
			for (var i = 0; i < predicates.length; i++) {
				var _tok = predicates[i].split(ontology.searchIdDelim);//'1.0.23~dbo:almaMater~1.0.2' => domain~pedicate~range
				var d = _tok[0]; //domain
				var p = _tok[1]; //predicate
				var r = _tok[2]; //range

				var l = p.substr(4, p.length).toLowerCase(); //label
				var matchFactor = l.length ? str.length/l.length : 0;
				var paddingMatch = l.indexOf(str.toLowerCase());
				var totMatch = matchFactor - paddingMatch;

				if(totMatch > bestMatch){
					bestMatch = totMatch;
					self.currentSuggestedPredicate.iri = p;
					self.currentSuggestedPredicate.dkey = d;
					self.currentSuggestedPredicate.rkey = r;
					if(str.toLowerCase() === l)	break;
				}
			}
			
			if(send_to_ui){
				self.predicateSuggestionsHtml = '';

				for (var i = 0; i < predicates.length; i++) {
					var _tok = predicates[i].split(ontology.searchIdDelim);//'1.0.23~dbo:almaMater~1.0.2' => domain~pedicate~range
					var d = (d.match(/0/) && ontology.dboClasses[_tok[0]]) ? ontology.dboClasses[_tok[0]].iri : _tok[0]; //domain
					var p = _tok[1]; //predicate
					var r = (r.match(/0/) && ontology.dboClasses[_tok[2]]) ? ontology.dboClasses[_tok[2]].iri : _tok[2]; //range
					var l = p.substr(4, p.length).toLowerCase(); //label

					var chref = 'dbo:'+l
					var title = chref + ' (domain=> '+d+ ' '+' | range=> '+ r +')';
					var chtml = '<a data-class=\'true\' style=\'color:inherit;\' href=\''+chref+'\' target=\'_blank\' title=\''+title+'\'>'+l+'</a>';
					if(self.currentSuggestedPredicate.iri === p){
						chtml = chtml.replace('color:inherit', 'color:forestgreen');
						self.predicateSuggestionsHtml = chtml +'&nbsp; '+ self.predicateSuggestionsHtml;
					}
					else{
						self.predicateSuggestionsHtml+= '&nbsp; '+chtml;
					}
						
				}
				self.sendPredicateSuggestion(self.predicateSuggestionsHtml);
			}
		}
		this.suggestClasses = function(str, send_to_ui){
			self.currentSuggestedClass = {}

			var classes = ontology.getMatchedClasses(str);
			var bestMatch = -200;
			for (var i = 0; i < classes.length; i++) {
				var _tok = classes[i].split(ontology.searchIdDelim);
				var k = _tok[0];
				var c = _tok[1];
				var l = c.substr(4, c.length).toLowerCase();
				var matchFactor = l.length ? str.length/l.length : 0;
				var paddingMatch = l.indexOf(str.toLowerCase());
				var totMatch = matchFactor - paddingMatch;
				if(totMatch > bestMatch){
					bestMatch = totMatch;
					self.currentSuggestedClass.iri = c;
					self.currentSuggestedClass.key = k;
					if(str.toLowerCase() === l)	break;
				}
			}

			if(send_to_ui){
				self.classSuggestionsHtml = '';
				for (var i = 0; i < classes.length; i++) {
					var c = classes[i].split(ontology.searchIdDelim)[1];
					var l = c.substr(4, c.length);
					var chref = 'dbo:'+ l
					var chtml = '<a data-class=\'true\' style=\'color:inherit;\' href=\''+chref+'\' target=\'_blank\' title=\''+chref+'\'>'+l+'</a>';
					if(self.currentSuggestedClass.iri === c){
						chtml = chtml.replace('color:inherit', 'color:forestgreen');
						self.classSuggestionsHtml = chtml +'&nbsp; '+ self.classSuggestionsHtml;
					}
					else{
						self.classSuggestionsHtml+= '&nbsp; '+chtml;
					}
				}
				self.sendClassSuggestion(self.classSuggestionsHtml);
			}
		}
		this.selectClassTripplePatternFromStr = function(str, send_to_ui){
			var sens = compendium.analyse(str);
			var toks = str.split(' ');// note that tokens are generatd by @me and tags by compendium and 
			// compendiun tokens are assumed to be same as @me
			var tags = sens[0].tags;
			var c = null;
			var p = null;
			var o = null;

			if(tags.length && tags[0].match(/DT/)){// all
				if(tags.length > 1 && tags[1].match(/NN/)){// scientist
					c = toks[1];
					c= c.charAt(0).toUpperCase() + c.slice(1, c.length);

					if(tags.length > 2 && tags[2].match(/WP/)){// who
						console.log('WP');
						if(tags.length > 3 && tags[3].match(/VBD/)){// VBD // went/ died
							p = toks[3];// studied
							if(tags.length > 4 && tags[4].match(/(TO|IN)/)){// to/in
								p = toks.slice(3, 5).join(' ');
								if(tags.length > 5 && tags[5].match(/NN/)){// London
									o = toks.slice(5, toks.length).join(' ');
								}
							}
							else if(tags.length > 4 && tags[4].match(/NN/)){//Mathematics
								o = toks.slice(4, toks.length).join(' ');
							}
						}
						else if(tags.length > 3 && tags[3].match(/VB[ZP]/)){// VBZ => has, VBP => have
							if(tags.length > 4 && tags[4].match(/JJ/)){// birth => this works like an adjective because of a noun ahead
								if(tags.length > 5 && tags[5].match(/NN/)){//place
									p = toks.slice(3,5).join(' '); // have birth place
									if(tags.length > 6 && tags[6].match(/NN/)){//NNP=> London
										o = toks.slice(6, toks.length).join(' ');
									}
								}
							}
						}
						else if(tags.length > 3 && tags[3].match(/JJ/)){//live @!! somehow compendium says live is JJ
							if(tags.length > 4 && tags[4].match(/IN/)){
								p = toks.slice(3,5).join(' '); //live in
								if(tags.length > 5 && tags[5].match(/NN/)){//Mexico
									o = toks.slice(5, toks.length).join(' ');
								}
							}
						}
					}
					else if(tags.length > 2 && tags[2].match(/VBD/)){// known 
						if(tags.length > 3 && tags[3].match(/IN/)){// for
							p = toks.slice(2, 4).join(' ');// known for
							if(tags.length > 4 && tags[4].match(/NN/)){// Optics
								o = toks.slice(4, toks.length).join(' ');
							}
							else{
								self.suggestPredicate(p, send_to_ui);
							}

						}
					}
					else if(tags.length > 2 && tags[2].match(/IN/)){// with
						if(tags.length > 3 && tags[3].match(/NN/)){// birthPlace
							p = toks.slice(3, 4).join(' ');// birthplace

							if(tags.length > 4 && tags[4].match(/NN/)){// London
								o = toks.slice(4, toks.length).join(' ');
							}
							else{
								self.suggestPredicate(p, send_to_ui);
							}
						}
					}
					else if(tags.length > 2 && tags[2].match(/VBG/)){// gerund 
						p = toks.slice(2, 3).join(' ');// (Film) starring
						if(tags.length > 3 && tags[3].match(/NN/)){// Jenifer Lawrance
							o = toks.slice(3, toks.length).join(' ');
						}
						else{
							self.suggestPredicate(p, send_to_ui);
						}
					}
					else{
						self.suggestPredicate('', send_to_ui);
						console.log('No match');
					}
				}
			}
			console.log(toks, c,p,o);
			return {c:c, p:p, o:o};
		}
		this.processAndSendClassObjectAnswers = function(){
			var CCS = self.classContextStack;
			if(CCS.classInstances){
				var instances = CCS.classInstances;
				var answers = [];

				for (var i = 0; i < instances.length; i++) {
					var ans = {};
					var s = instances[i].value;
					var os = tripplestore.getValues(s, 'rdfs:label');
					if(os.length){
						var o = os[0];
						ans.title = o;
					}
					

					os = tripplestore.getValues(s, 'scards:termDescription');
					if(os.length){
						ans.desc = os[0];
					}

					os = tripplestore.getValues(s, 'dbo:thumbnail');
					if(os.length){
						ans.thumb_source = os[0];
					}
					
					// precaution
					if(!ans.title) ans.title = self.getTitleFromUrl(instances[i].value);

					answers.push(ans);
				}
				self.sendClassObjectInstances(answers);
			}
		}

		this.getDbpediaUrl = function(wikiTitleOrUrl) {
			var url = wikiTitleOrUrl;
			if (url.indexOf('wikipedia')!=-1) {
				var parts = url.split('/');
				var title = parts[parts.length-1];
				url = 'http://dbpedia.org/resource/' + title;
				return url;
			} 
			else if (url.indexOf('dbpedia.org')!=-1) {
				return url;
			} 
			else{
				url = 'http://dbpedia.org/resource/' + url.replace(/ /g, '_');
				// url = 'dbr:' + url.replace(/ /g, '_');
				return url;
			}
		};
		this.getTitleFromUrl = function(url){
			var match = url.match(/.+[\/](.+)$/);
			if(match) return match[1].replace('_', ' ');
			else url.replace('_', ' ');
		}
		this.removeQuestions =  function(){
			console.warn('complete TODO, Remove Questions');
		};

		this.ALL_PREDICATES_URI = 'scards:allPredicates';

		this.uriToPredicateNames = {};
		this.contextStack = [];//{subject, parentPredicate, childPredicate, }
		this.lastContextStack = [];// will be used to use context selection by thr user from ui, because contextStack is always built from null;
		this.termSuggestions = [];
		this.objectSuggestions = [];
		this.maxSparqlQuery = 10;
		this.noOfSparqlQueryMade = 0;
		var countLoop = 0;

		this.prepareContextStack = function(param){
			countLoop++;

			for (var i = 0; i < self.contextStack.length; i++) {
				if(self.contextStack[i].built)continue;// stack already filled previously
				
				var tokenStr = self.tokenStrings[i];
				var lastToken = (i === tokenStrings.length-1);

				if(i === 0){
					var qsearch = self.onlineSearchQuery;
					var term_id = Date.now().toString(36) + '0';// save his to ustore
					var qanswer = self.gotATermToken(term_id, tokenStr, 'pc subject suggestions');
					if(qanswer){// question and answer already exists
														//namedNodes
						self.contextStack[i].subjects = [];
						for (var j = 0; j < qanswer.answers.length; j++) {
							self.contextStack[i].subjects.push(qanswer.answers[j]);
						}
						self.contextStack[i].subject = qanswer.answers[0];//TODO, for now only 0th
						self.contextStack[i].built = true;

						// change the context based on previous context selection by the user
						if(self.lastContextStack.length > i){
							var last_tok = self.lastContextStack[i].token;
							var cur_token = self.contextStack[i].token;
							if(last_tok === cur_token){// nothing changed in the command input, use the last context subject
								self.contextStack[i].subject = self.lastContextStack[i].subject;
								self.contextStack[i].uiid = self.lastContextStack[i].uiid;
							}
						}

					}
					else{
						qsearch.getWikipediaSuggestions(tokenStr, term_id);
						// qsearch.getGoogleSuggestions(question, term_id);
						// qsearch.getUmbelConcept(question, term_id);
						// qsearch.getDuckDuckGoSuggestions(question, term_id);
						// qsearch.getDbpediaLookupSuggestions(question, term_id);
						
						if(countLoop < 3)return;// important, as query are async . this function will be called again when data is available 
					}
				}
				else{
					console.log('searching for pedicates', i);
					var ps = self.contextStack[i-1].subject;
					if(!ps){
						console.log('Subject is not defined for context', i-1, '  ' +self.contextStack[i-1]);
						return;
					}
					else{
						console.log(' now start working with context', i);
						if(param){// result from sparql query 
							console.log('got a param in context ', param,  i);
							if(param.sparqlid === self.contextStack[i].sparqlid){// this is for me(i)
								console.log('this sparqlid is for me', i);
								delete self.contextStack[i].sparqlid;

								if(param.type === 'allPredicate'){
									if(param.status === 'zeroresults'){
										self.contextStack[i].object = '0 Results';
										self.contextStack[i].built = true;// no need to come to this index again
									}
									else{
										console.log('got all predicates from sparql for ', ps);

										// first remove all predicates for ps; and add the new ones from sparql results
										tripplestore.set(ps, self.ALL_PREDICATES_URI, param.predicates);//o is an arry of predicates URI
										
										self.contextStack[i].parentPredicates = [];// list of all matched predicates for a given tokenStr
										predicateLabels = [];
										for (var j = 0; j < param.predicates.length; j++) {
											var p = param.predicates[j];
											match = p.match(/.+[\/#](.+)$/);
											if(match){
												if(match[1].toLowerCase().indexOf(tokenStr.toLowerCase()) > -1){// matched the last part of the URI
													self.contextStack[i].parentPredicates.push(p);// don't save lable. as we have to refer to full uri
													if(lastToken) predicateLabels.push({desc:'<a data-predicate=\'true\' style=\'color:inherit;\' href=\''+p+'\' target=\'_blank\' title=\''+p+'\'>'+match[1]+'</a>'});
												}
											}
										}

										if(self.contextStack[i].parentPredicates.length){// atleast one matched
											// set the selected predicate, here its is the first one
											self.contextStack[i].parentPredicate = self.contextStack[i].parentPredicates[0]; 
										}
										// console.log('stringMatchedPredicate', stringMatchedPredicate);
									
										if(self.contextStack[i].parentPredicate){
											// if(!lastToken){// dont get for last token , it will incur lot of bandwidth as the user is typing 
															// once the user presses a dot// a random lastToken will be inserted to the  list and will then fetch the objects
												
												var p = self.contextStack[i].parentPredicate;
												if(self.maxSparqlQuery - self.noOfSparqlQueryMade > 0){
													var sparqlid = self.contextStack[i].sparqlid = Date.now().toString(36);
													console.log('_________________  Getting Object  _______________param')
													self.sparql.getObject(ps, p, sparqlid);
													self.noOfSparqlQueryMade++;

													return;// will come here again
												}
												else{
													console.warn('Why sparql query exceded max limit');
												}
											// }
										}
										
										if(lastToken){
											if(!predicateLabels.length){
												// what the user has written has not matched with any predicate 
												// suggest a new one here
												for (var j = 0; j < param.predicates.length; j++) {
													var p = param.predicates[j];
													match = p.match(/.+[\/#](.+)$/);
													if(match){
														predicateLabels.push({desc:'<a data-predicate=\'true\' style=\'color:inherit;\' href=\''+p+'\' target=\'_blank\' title=\''+p+'\'>'+match[1]+'</a>'});// if match it will have two values
													}
												}
											}
											self.termSuggestions = _.sortBy(predicateLabels, 'desc');
										}
									}
								}

								else if(param.type === 'object'){
									if(param.objs){
										console.log(param.objs);	
										if(param.status === 'zeroresults'){
											self.contextStack[i].object = '0 Results';
											self.contextStack[i].built = true;// no need to come to this index again
										}
										else{
											var ps = self.contextStack[i-1].subject;
											var p = self.contextStack[i].parentPredicate;// it must exist , as this call was made for this p
											// remove dublicates
											// first remove all from this subject, property => objects
											tripplestore.remove(ps, p);// removes all objects

											self.contextStack[i].subjects = [];// all objects from: ps => p
											for (var j = 0; j < param.objs.length; j++) {
												var obj = param.objs[j];
												if(obj.value.length){
													tripplestore.add(ps, p, obj.value);
													self.contextStack[i].subjects.push(obj.value);
												}
											}
											if(self.contextStack[i].subjects.length){
												self.contextStack[i].subject = self.contextStack[i].subjects[0];// selected subjects out of many
												// no need to choose from previous context , as these were just pulled from sparql just now, they never had been presented to the user to chose from
												// so they will not exist in the previous context
											}
											self.contextStack[i].built = true;
										}
									}
								}
							}
							else{
								if(self.contextStack[i].sparqlid)console.log(' sparql id doesn\'t match, but exist');
							}
						}
						else{// when comming with param there is no need to check this// as with the above if (param) => everything is done to get the object for this context
							console.log('No param', i);	

							var predicateLabels = [];
							var predicates = tripplestore.getValues(ps, self.ALL_PREDICATES_URI);
							// which is [[p1, p2, p3....]]
							if(predicates.length) predicates = predicates[0];
							else{
								console.log('all predicate list not found');
							}
							if(predicates.length > 2){
								self.contextStack[i].parentPredicates = [];// list of all matched predicates for a given tokenStr
								for (var j = 0; j < predicates.length; j++) {
									p = predicates[j];
									match = p.match(/.+[\/#](.+)$/);
									if(match && match[1].toLowerCase().indexOf(tokenStr.toLowerCase()) > -1){// matched the last part of the URI
										self.contextStack[i].parentPredicates.push(p);// insert the whole URI
										if(lastToken) predicateLabels.push({desc:'<a data-predicate=\'true\' style=\'color:inherit;\' href=\''+p+'\' target=\'_blank\' title=\''+p+'\'>'+match[1]+'</a>'});
									}
								}

								if(self.contextStack[i].parentPredicates.length){// atleast one matched
									self.contextStack[i].parentPredicate = self.contextStack[i].parentPredicates[0]; // select one 

									// change the context based on previous context selection by the user
									if(self.lastContextStack.length > i){
										var last_tok = self.lastContextStack[i].token;
										var cur_token = self.contextStack[i].token;
										if(last_tok === cur_token){// nothing changed in the command input, use the last context subject
											self.contextStack[i].parentPredicate = self.lastContextStack[i].parentPredicate;
										}
									}
									
									var p = self.contextStack[i].parentPredicate;
									console.log('showing results for predicate ' + p);

									var objects = tripplestore.getValues(ps, p);
									// console.log(objects, j);
									self.contextStack[i].subjects = [];

									if(objects.length){// atleast one object exists
										for (var j = 0; j < objects.length; j++) {
											var o = objects[j];
											self.contextStack[i].subjects.push(o);
										}
										self.contextStack[i].subject = self.contextStack[i].subjects[0];// selected subjects out of many

										// change the context based on previous context selection by the user
										if(self.lastContextStack.length > i){
											var last_tok = self.lastContextStack[i].token;
											var cur_token = self.contextStack[i].token;
											if(last_tok === cur_token){// nothing changed in the command input, use the last context subject
												self.contextStack[i].subject = self.lastContextStack[i].subject;
												self.contextStack[i].uiid = self.lastContextStack[i].uiid;
											}
										}

									}
									else{
										// if(!lastToken){// dont get for last token , it will incur lot of bandwidth as the user is typing 
														// once the user presses a dot// a random lastToken will be inserted to the  list and will then fetch the objects
											console.log(ps, p , 'Object doesn\'t exits', j);
											if(self.maxSparqlQuery - self.noOfSparqlQueryMade > 0){
												var sparqlid = self.contextStack[i].sparqlid = Date.now().toString(36);
												console.log('_________________  Getting Object  _______________no param')
												self.sparql.getObject(ps, p, sparqlid);
												self.noOfSparqlQueryMade++;
												
												return;// will come here again
											}
											else{
												console.warn('Why sparql query exceded max limit');
											}
										// }
									}
									self.contextStack[i].built = true;// if it came till here then , it must be done
								}		

								if(lastToken){
									if(!predicateLabels.length){
										// what the user has written has not matched with any predicate 
										// suggest a new one here
										for (var j = 0; j < predicates.length; j++) {
											var p = predicates[j];
											match = p.match(/.+[\/#](.+)$/);
											if(match){
												predicateLabels.push({desc:'<a data-predicate=\'true\' style=\'color:inherit;\' href=\''+p+'\' target=\'_blank\' title=\''+p+'\'>'+match[1]+'</a>'});// if match it will have two values
											}
										}
									}
									self.termSuggestions = _.sortBy(predicateLabels, 'desc');
								}
							}
							else{
								console.log(ps, 'doesnot have enough predicates');
								if(self.maxSparqlQuery - self.noOfSparqlQueryMade > 0){
									self.contextStack[i].sparqlid = Date.now().toString(36);
									console.log("---------------Getting All Predicate---------- for " + i);
									sparql.getAllEnglishPredicate(ps, self.contextStack[i].sparqlid);
									self.noOfSparqlQueryMade++;

									return;
								}
								else{
									console.warn('Why sparql query exceded max limit');
								}
							}
						}
					}
				}

				if(lastToken){// every part of the stack is filled now
					console.log(self.contextStack);
					self.processAndSendAnswers();
					console.log('came inside function, prepare  context ' + countLoop+ ' times' );
					countLoop=0;
				}
			}
		}
	
		this.gotAPredicateToken = function(subject_index, str){

		};

		this.gotATermToken = function(term_id, question, question_type){
			// first check if a similar question was already asked
			var qs =  self.fastStringSearch(self.questionSearchStringSource, question);
			// console.log(qs);
			//qs : {results:[Strings], count:Int}
			for (var i = 0; i < qs.results.length; i++) {
				var id = qs.results[i].split(self.searchIdDelim)[0];
				// string split length is always > 0;
				if(self.queryQuestions[id]){// if the question really exist
					self.queryQuestions[id].count++;// asked again
					if(self.queryAnswers[id]) return self.queryAnswers[id];// id are same for question and answer
					// question was already asked no need to search again
				}
			}
			
			self.queryQuestions[term_id] = {id:term_id, question:question, type:question_type, count:1};
			if(self.questionSearchStringSource.length > 2000){
				self.removeQuestions();
				self.questionSearchStringSource = self.questionSearchStringSource.slice(10000, 20000);
				// var f = self.questionSearchStringSource.indexOf('"');
				// remove half formatted string in the pattern
				console.log('removing some sreach cache');
				// if search sting is greater than 20000 remove initial questions
			}
			
			self.questionSearchStringSource+= self.searchDelim + term_id + self.searchIdDelim + question.toLowerCase() + self.searchDelim;//'"23 who is Isaac Newton"'
		};

		this.last_subject_query_str = '';
		this.questionFromTab = function(question, tab_id){
			self.tab_id = tab_id;
			// do some NER
			// question api services
			// and wait for them to respond
			
			if(question.length > 2) {// this makes sure that , analysis is always done

				question = question.replace(/\s+/g, " ");// remove multipele spaces
				self.tokenStrings = [];
				// self.spaceTokens = question.replace(/\s+/g, " ").split(" ");
				self.analysedSentences = compendium.analyse(question);
				var analyseSs = self.analysedSentences;

				for (var i = 0; i < analyseSs.length; i++) {
					var tok = analyseSs[i].raw;
					self.tokenStrings.push(tok.replace(/[\.?]/, ''));
				}
				self.rootToken = tokenStrings[0];// @asume length is > 1
				var lastToken = tokenStrings[analyseSs.length-1];

				var termended = question.match(/[\.?]+[\s]*$/);// compendiun will take only valid sentences ; but we need full stops and ? marks to say that it ended
				var spaceatend = question.match(/\s$/);



				self.rootTags = analyseSs[0].tags.join(' ');

				self.dotSplit = question.split('.');// ['all scientist who have birthplace London and went to Oxford or Cambridge', '']
				self.andSplits = self.dotSplit[0].split(' and ');
				for (var i = 0; i < self.andSplits.length; i++) {
					self.andSplits[i] = self.andSplits[i].split(' or ');
				}


				//    all scientist known for Physics   and   who went to Cambridge or Oxford  and  died in London
				//[  'all scientist known for Physics',      'who went to Cambridge or Oxford',     died in London]
				//[ ['all scientist known for Physics'],    ['who went to Cambridge', 'Oxford'],  ['died in london']]

				// SEARCH BASED ON STORED ONTOLOGY
				// fS = self.dotSplit[0];
				// var tokens = fS.split(' ');
				// if(tokens[0].toLowerCase() === 'all'){
				// 	if(tokens.length>1){
				// 		if(tokens.length==2)self.suggestClasses(tokens[1], true);
				// 		if(tokens.length>2){// all scientist knownFor
				// 			self.classContextStack = {class:self.currentSuggestedClass, predicates:[], objects:[], classInstances:[]};//and with predicates and or with orbects
				// 			self.prepareClassContextStack();
				// 			self.lastClassContextStack = self.classContextStack;
				// 		}
				// 	}
				// 	//console.log(self.rootTags);
				// 	return;
				// }

				var tokens = self.dotSplit[0].split(' ');
				if(tokens[0].toLowerCase() === 'all'){
					self.explore.contextStack = [];
					for (var i = 0; i < andSplits.length; i++) {
						self.explore.contextStack.push({class:{}, predicate:{}, object:{}});
					}
					self.explore.start();
					return;
				}


				// note that this will only match for last sentence
				if(termended) tokenStrings.push('shdkhskdhsk');// this will search for all matches for the next possible predicates
				
				self.contextStack = [];
				self.termSuggestions = [];
				self.maxSparqlQuery = self.tokenStrings.length*2;// one for predicate one for object
				self.noOfSparqlQueryMade = 0;//init
				for (var i = 0; i < self.tokenStrings.length; i++) {
					self.contextStack.push({token:tokenStrings[i]});// start with the tokens used for each context
				}

				console.log('\n ------------------START---------------------------\n\n')
				self.prepareContextStack();
				// after context is prepared save in a safe place so that context changes from UI can be stored here
				// so it should be same as the current context stack , which sounds different from its name
				// but its called lasCon... because it will be old when the new context is prepared nex time
				self.lastContextStack = self.contextStack;
				// console.log(self.lastContextStack);	
			}

			//by this time do 
		}
		this.changeContextIndex = function(uiid, tab_id){
			
			var lcontextStore = _.last(self.lastContextStack);
			if(lcontextStore.subjects && lcontextStore.subjects.length){// ther is no point in changing context if there is only one
				if(lcontextStore.subjects.length> uiid && uiid > -1){
					lcontextStore.uiid = uiid;
					lcontextStore.subject = lcontextStore.subjects[uiid];
				}
			}
			// console.log('changing context to ', uiid);
		}


		//Answer
		this.sendAnswers = function(answers){
			var uiid = _.last(self.contextStack).uiid;
			sendMSG_to_tab_byId({type:'SW:ANSWER_FROM_BACK',  msg:{answers:answers, uiid:uiid}}, self.tab_id);//(msg, tab_id) => msg: {type:'TYPE', msg:{data:data}}
			console.log('answer sent');

		};
		this.sendHiddenwebAnsewersFactbites = function(answers){
			sendMSG_to_tab_byId({type:'SW:HIDDEN_WEB_ANSWERS_FACTBITES',  msg:{answers:answers}}, self.tab_id);//(msg, tab_id) => msg: {type:'TYPE', msg:{data:data}}
		};

		this.sendClassSuggestion = function(classSuggestionsHtml){
			var answers = [{desc:classSuggestionsHtml}];
			sendMSG_to_tab_byId({type:'SW:CLASS_SUGGESTIONS',  msg:{answers: answers}}, self.tab_id);//(msg, tab_id) => msg: {type:'TYPE', msg:{data:data}}
		};
		this.sendPredicateSuggestion = function(predicateSuggestionsHtml){
			var answers = [{desc:predicateSuggestionsHtml}];
			sendMSG_to_tab_byId({type:'SW:PREDICATE_SUGGESTIONS',  msg:{answers: answers}}, self.tab_id);//(msg, tab_id) => msg: {type:'TYPE', msg:{data:data}}
		};
		this.sendClassObjectInstances = function(answers){
			sendMSG_to_tab_byId({type:'SW:CLASS_OBJECT_INSTANCES',  msg:{answers:answers}}, self.tab_id);//(msg, tab_id) => msg: {type:'TYPE', msg:{data:data}}
			console.log('class instances sent');
		}
		this.sendClassObjectSuggestions = function(answers){
			sendMSG_to_tab_byId({type:'SW:CLASS_OBJECT_SUGGESTIONS',  msg:{answers:answers}}, self.tab_id);//(msg, tab_id) => msg: {type:'TYPE', msg:{data:data}}

		};

		this.fastStringSearch = function(source, term){
			var rx = new RegExp('"([^"]*'+term+'[^"]*)"','gi');
			var i = 0;
			var results = [];
			while (result = rx.exec(source)) {
				results.push(result[1]);
				// console.log('match: '+ result[1]);
			    i += 1;
			    if (i >= 25)break;
			}
			return {results:results, count:i};
		}












		return this;
	}

	var SW = SemanticWeb();
	







