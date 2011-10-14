/*

	This is the palpha fork of jquery-filedrop. It has been heavily remixed to work better:
		- proper (sort of) jQuery plug-in architecture:
			 .filedrop(options) or .filedrop('method', arg0, ...)
			 Methods: setOption, sendFromInput
		- multiple instances
		- readable code formatting (tabs + correct indentation)
		- most likely slightly better performance
		- not tested for IE compatibilty
	
	To do:
		- working drag event handling
	
	Project home:
		http://www.github.com/palpha/jquery-filedrop
	
	Version: 0 (completely unstable, use at your own peril)
	
	Original copyright notice:

 * Default text - jQuery plugin for html5 dragging files from desktop to browser
 *
 * Author: Weixi Yen
 *
 * Email: [Firstname][Lastname]@gmail.com
 *
 * Copyright (c) 2010 Resopollution
 *
 * Licensed under the MIT license:
 *   http://www.opensource.org/licenses/mit-license.php
 *
 * Project home:
 *   http://www.github.com/weixiyen/jquery-filedrop
 *
 * Version:  0.1.0
 *
 * Features:
 *      Allows sending of extra parameters with file.
 *      Works with Firefox 3.6+
 *      Future-compliant with HTML5 spec (will work with Webkit browsers and IE9)
 * Usage:
 * 	See README at project homepage
 *
 */
(function($) {

	jQuery.event.props.push("dataTransfer");

	var empty = $.noop,
		defaultOptions = {
			url: '',
			refresh: 1000,
			paramname: 'userfile',
			maxfiles: 25, // Ignored if queuefiles is set > 0
			maxfilesize: 1, // MB file size limit
			queuefiles: 0, // Max files before queueing (for large volume uploads)
			queuewait: 200, // Queue wait time if full
			data: {},
			drop: empty,
			dragEnter: empty,
			dragOver: empty,
			dragLeave: empty,
			docEnter: empty,
			docOver: empty,
			docLeave: empty,
			beforeAll: empty,
			beforeEach: empty,
			afterAll: empty,
			rename: empty,
			error: function(err, file, i) {
				alert(err);
			},
			uploadStarted: empty,
			uploadFinished: empty,
			progressUpdated: empty,
			speedUpdated: empty
		},
		errors = {
			NotSupported: 'BrowserNotSupported',
			TooManyFiles: 'TooManyFiles',
			FileTooLarge: 'FileTooLarge',
			TransferFailed: 'TransferFailed'
		},
		methods = {
			init: function (options) {
				return this.each(function () {
					var container = $(this),
						opts = $.extend({}, defaultOptions, options),
						engine = new Engine(container, opts);
					container.data('filedrop', engine);
				});
			},
			sendFromInput: function (input) {
				return this.each(function () {
					var engine = $(this).data('filedrop');
					engine.setFiles($(input).prop('files'));
					engine.upload();
				});
			},
			setOption: function (key, value) {
				return this.each(function () {
					var engine = $(this).data('filedrop');
					engine.setOption(key, value);
				});
			}
		};

	$.fn.filedrop = function (method) {
		if (methods.hasOwnProperty(method)) {
			return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
		} else if (typeof method === 'object' || !method) {
			return methods.init.apply(this, arguments);
		} else {
			$.error('Method ' + method + ' does not exist on jQuery.filedrop.');
		}
	};

	function Engine(element, opts) {
		var doc_leave_timer, stop_loop = false,
			files_count = 0,
			files,
			self = this;
		
		element
			.bind('drop.filedrop', drop)
			.bind('dragenter.filedrop', dragEnter)
			.bind('dragover.filedrop', dragOver)
			.bind('dragleave.filedrop', dragLeave);
		$(document)
			.bind('drop.filedrop', docDrop)
			.bind('dragenter.filedrop', docEnter)
			.bind('dragover.filedrop', docOver)
			.bind('dragleave.filedrop', docLeave);

		self.setFiles = function (fileArr) {
			files = fileArr;
			files_count = files.length;
		};
		
		self.setOption = function (key, value) {
			opts[key] = value;
		};

		function drop(e) {
			opts.drop(e);
			files = e.dataTransfer.files;
			if (files === null || files === undefined) {
				opts.error(errors.NotSupported);
				return false;
			}
			files_count = files.length;
			self.upload();
			e.preventDefault();
			return false;
		}
	
		function getBuilder(filename, filedata, boundary) {
			var dashdash = '--',
				crlf = '\r\n',
				builder = [],
				params;
	
			if (opts.data && $.isPlainObject(opts.data) && !$.isEmptyObject(opts.data)) {
				params = $.param(opts.data, opts.paramtraditional).split(/&/);
	
				$.each(params, function() {
					var pair = this.split(/\=/, 2),
						name = decodeURI(pair[0]),
						val = decodeURI(pair[1]);
	
					builder.push(dashdash);
					builder.push(boundary);
					builder.push(crlf);
					builder.push('Content-Disposition: form-data; name="' + name + '"');
					builder.push(crlf);
					builder.push(crlf);
					builder.push(val);
					builder.push(crlf);
				});
			}
	
			builder.push(dashdash);
			builder.push(boundary);
			builder.push(crlf);
			builder.push('Content-Disposition: form-data; name="' + opts.paramname + '"');
			builder.push('; filename="' + filename + '"');
			builder.push(crlf);
			
			builder.push('Content-Type: application/octet-stream');
			builder.push(crlf);
			builder.push(crlf);
	
			builder.push(filedata);
			builder.push(crlf);
	
			builder.push(dashdash);
			builder.push(boundary);
			builder.push(dashdash);
			builder.push(crlf);
			
			return builder.join('');
		}
	
		function progress(e) {
			if (e.lengthComputable) {
				var percentage = Math.round((e.loaded * 100) / e.total),
						elapsed, diffTime, diffData, speed;
				if (this.currentProgress != percentage) {
	
					this.currentProgress = percentage;
					opts.progressUpdated(this.index, this.file, this.currentProgress);
	
					elapsed = new Date().getTime();
					diffTime = elapsed - this.currentStart;
					if (diffTime >= opts.refresh) {
						diffData = e.loaded - this.startData;
						speed = diffData / diffTime; // KB per second
						opts.speedUpdated(this.index, this.file, speed);
						this.startData = e.loaded;
						this.currentStart = elapsed;
					}
				}
			}
		}
	
		// Respond to an upload
		self.upload = function () {
			stop_loop = false;
	
			if (!files) {
				opts.error(errors.NotSupported);
				return false;
			}
	
			var filesDone = 0,
				filesRejected = 0,
				workQueue, processingQueue, doneQueue,
				pause, process, send, i;
	
			if (files_count > opts.maxfiles && opts.queuefiles === 0) {
				opts.error(errors.TooManyFiles);
				return false;
			}
			
			opts.beforeAll(files);
	
			// Define queues to manage upload process
			workQueue = [];
			processingQueue = [];
			doneQueue = [];
	
			// Add everything to the workQueue
			for (i = 0; i < files_count; i++) {
				workQueue.push(i);
			}
	
			// Helper function to enable pause of processing to wait
			// for in process queue to complete
			pause = function(timeout) {
				setTimeout(process, timeout);
				return;
			};
	
			// Process an upload, recursive
			process = function() {
				var fileIndex, reader, max_file_size;

				if (stop_loop) return false;

				// Check to see if are in queue mode
				if (opts.queuefiles > 0 && processingQueue.length >= opts.queuefiles) {

					return pause(opts.queuewait);

				} else {
					// Take first thing off work queue
					fileIndex = workQueue[0];
					workQueue.splice(0, 1);

					// Add to processing queue
					processingQueue.push(fileIndex);
				}

				try {
					if (beforeEach(files[fileIndex]) != false) {
						if (fileIndex === files_count) return;
						reader = new FileReader();
						max_file_size = 1048576 * opts.maxfilesize;

						reader.index = fileIndex;
						if (files[fileIndex].size > max_file_size) {
							opts.error(errors.FileTooLarge, files[fileIndex], fileIndex);
							// Remove from queue
							processingQueue.forEach(function(value, key) {
								if (value === fileIndex) processingQueue.splice(key, 1);
							});
							filesRejected++;
							return true;
						}
						reader.onloadend = send;
						reader.readAsBinaryString(files[fileIndex]);

					} else {
						filesRejected++;
					}
				} catch (err) {
					// Remove from queue
					processingQueue.forEach(function(value, key) {
						if (value === fileIndex) processingQueue.splice(key, 1);
					});
					opts.error(errors.NotSupported);
					return false;
				}

				// If we still have work to do,
				if (workQueue.length > 0) {
					process();
				}
			};
	
			send = function(e) {
				e = e || window.event;
				var fileIndex = (e.target || e.srcElement).index;
	
				// Sometimes the index is not attached to the
				// event object. Find it by size. Hack for sure.
				if (typeof fileIndex === 'undefined') {
					fileIndex = getIndexBySize(e.total);
				}
	
				var xhr = new XMLHttpRequest(),
					upload = xhr.upload,
					file = files[fileIndex],
					index = fileIndex,
					start_time = new Date().getTime(),
					boundary = '------multipartformboundary' + (new Date).getTime(),
					builder;
	
				newName = rename(file.name);
				if (typeof newName === "string") {
					builder = getBuilder(newName, e.target.result, boundary);
				} else {
					builder = getBuilder(file.name, e.target.result, boundary);
				}
	
				upload.index = index;
				upload.file = file;
				upload.downloadStartTime = start_time;
				upload.currentStart = start_time;
				upload.currentProgress = 0;
				upload.startData = 0;
				upload.addEventListener('progress', progress, false);
	
				xhr.onreadystatechange = function () {
					if (this.readyState === 4 && this.status !== 200) {
						opts.error(errors.TransferFailed, file, index, xhr);
					}
				};
	
				xhr.onload = function() {
					if (xhr.responseText) {
						opts.progressUpdated(index, file, 100);
						var now = new Date().getTime(),
							timeDiff = now - start_time,
							result = (function () {
								try {
									return opts.uploadFinished(index, file, jQuery.parseJSON(xhr.responseText), timeDiff);
								} catch (x) {}
								return true;
							}());
						filesDone++;
	
						// Remove from processing queue
						processingQueue.forEach(function(value, key) {
							if (value === fileIndex) processingQueue.splice(key, 1);
						});
	
						// Add to donequeue
						doneQueue.push(fileIndex);
						
						if (filesDone == files_count - filesRejected) {
							afterAll();
						}
						if (result === false) stop_loop = true;
					}
				};
	
				xhr.open("POST", opts.url, true);
				xhr.setRequestHeader('content-type', 'multipart/form-data; boundary=' + boundary);
				xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	
				xhr.sendAsBinary(builder);
	
				opts.uploadStarted(index, file, files_count);
			}
	
			// Initiate the processing loop
			process();
		};
	
		function getIndexBySize(size) {
			for (var i = 0; i < files_count; i++) {
				if (files[i].size == size) {
					return i;
				}
			}
	
			return undefined;
		}
	
		function rename(name) {
			return opts.rename(name);
		}
	
		function beforeEach(file) {
			return opts.beforeEach(file);
		}
	
		function afterAll() {
			return opts.afterAll();
		}
	
		function dragEnter(e) {
			clearTimeout(doc_leave_timer);
			e.preventDefault();
			opts.dragEnter(e);
		}
	
		function dragOver(e) {
			clearTimeout(doc_leave_timer);
			e.preventDefault();
			opts.docOver(e);
			opts.dragOver(e);
		}
	
		function dragLeave(e) {
			clearTimeout(doc_leave_timer);
			opts.dragLeave(e);
			e.stopPropagation();
		}
	
		function docDrop(e) {
			e.preventDefault();
			opts.docLeave(e);
			return false;
		}
	
		function docEnter(e) {
			clearTimeout(doc_leave_timer);
			e.preventDefault();
			opts.docEnter(e);
			return false;
		}
	
		function docOver(e) {
			clearTimeout(doc_leave_timer);
			e.preventDefault();
			opts.docOver(e);
			return false;
		}
	
		function docLeave(e) {
			doc_leave_timer = setTimeout(function() {
				opts.docLeave(e);
			}, 200);
		}
	}

	// set up the sendAsBinary method if it doesn't exist
	try {
		if (XMLHttpRequest.prototype.sendAsBinary) return;
		XMLHttpRequest.prototype.sendAsBinary = function(datastr) {
			function byteValue(x) {
				return x.charCodeAt(0) & 0xff;
			}
			var ords = Array.prototype.map.call(datastr, byteValue),
				ui8a = new Uint8Array(ords);
			this.send(ui8a.buffer);
		}
	} catch (e) {}

})(jQuery);