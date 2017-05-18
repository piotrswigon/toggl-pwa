if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').then(function(registration) {
      // Registration was successful
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }).catch(function(err) {
      // registration failed :(
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

function makeRequest (opts) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url);
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(xhr.response);
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    if (opts.headers) {
      Object.keys(opts.headers).forEach(function (key) {
        xhr.setRequestHeader(key, opts.headers[key]);
      });
    }
    var params = opts.params;
    // We'll need to stringify if we've been given an object
    // If we have a string, this is skipped.
    if (params && typeof params === 'object') {
      params = Object.keys(params).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      }).join('&');
    }
    xhr.send(params);
  });
}

var db = new Dexie("QuickTogglDB");
db.version(1).stores({
  credentials: "email"
});

var email, api_token, workspace;
var entries_map = {}; // PID -> [task_descriptions*]
var NO_PROJECT_PID = "no_project";

db.credentials.toArray().then(function(credentials_array) {
  if (credentials_array.length === 0) {
    $('#login_glass').show();
  } else {
    credentials = credentials_array[0];
		email = credentials.email;
		api_token = credentials.api_token;
		workspace = credentials.workspace;
		/*run_ui();*/
		check_cors();
  }
});

function check_cors() {
  makeRequest({
			method: 'POST',
			url: 'https://www.toggl.com/api/v8/sessions' /*+ user_params()*/,
			headers: auth_header(),
		}).then(JSON.parse).then(function(response) {
			console.log(response);
		});
}

function verify_credentials(_email, _api_token, success_callback) {
  makeRequest({
				method: 'GET',
				url: 'https://www.toggl.com/api/v8/me?' + user_params(_email),
				headers: auth_header(_api_token)
			}).then(JSON.parse).then(response => {
			  email = _email;
        api_token = _api_token;
        workspace = response.data.workspaces[0].id;
        db.credentials.add({email: email, api_token: api_token, workspace: workspace});
        success_callback();
			}).catch(() => {
			  $('#login_dialog').shake({speed: 80});
			});
}

function add_client_group(name, id) {
  $('#projects_section').append('<div class="client_group"><h1>' + name + '</h1>' +
    '<div class="pill_container" data-cid="' + id + '"></div></div>');
}

$('#login_button').click(function() {
  verify_credentials($('#email_input').val(), $('#api_token_input').val(), () => {run_ui();});
});

function close_entries() {
  $('#entries_section').hide();
  $('#projects_section').fadeIn();
  $('body').css('background-color', 'rgb(236, 236, 236)');
}

$('#project_close').click(close_entries);

function show_entries(pid) {
  var entries_string = "";
  for (let task_description of (entries_map[pid] || [])) {
    entries_string += '<span class="pill" data-entry>' + task_description + '</span>';
  }
  $('#entries').html(entries_string);
  $('#entries').attr('data-project', pid);
  $('#entries_section').fadeIn();
  
  $('span[data-entry=""]').click(function() {
    makeRequest({
			method: 'POST',
			url: 'https://www.toggl.com/api/v8/time_entries/start?' + user_params(),
			headers: auth_header(),
			params: '{"time_entry":{"description":"' + this.innerText + '","pid":' + this.parentNode.getAttribute('data-project') + ',"created_with":"QuickToggl"}}'
		}).then(JSON.parse).then(function(response) {
			$('#app_header').html('Currently: ' + (response.data ? response.data.description : 'No running project'));
			close_entries();
		});
  });
}

function user_params(_email, _workspace) {
  return 'user_agent=' + (_email || email) + '&workspace_id=' + (_workspace || workspace);
}

function auth_header(_api_token) {
  return {
    'Authorization': 'Basic ' + btoa((_api_token || api_token) + ':api_token')
  };
}

function run_ui() {
  $('#login_glass').hide();
  $('#loading_glass').show();
  
  makeRequest({
		method: 'POST',
		url: 'https://www.toggl.com/api/v9/me/cors?' + user_params(),
		headers: auth_header(),
		params: '{"domain":"ptrs29.github.io"}'
	}).then(JSON.parse).then(function(response) {
	  console.log('CORS call finishes');
		console.log(response);
		console.log('-----');
	}).catch(error => {
	  console.log('CORS call returns an error');
	  console.log(reponse);
	  console.log('-----');
	});
  
  var current_entry = makeRequest({
    method: 'GET',
    url: 'https://www.toggl.com/api/v8/time_entries/current?' + user_params(),
    headers: auth_header()
  }).then(JSON.parse).then(function(response) {
    $('#app_header').html('Currently: ' + (response.data ? response.data.description : 'No running project'));
  });
	
	var render_ui = Promise.all([
	  makeRequest({
				method: 'GET',
				url: 'https://www.toggl.com/api/v8/clients?' + user_params(),
				headers: auth_header()
			}).then(JSON.parse),
	  makeRequest({
				method: 'GET',
				url: 'https://www.toggl.com/api/v8/me?with_related_data=true&' + user_params(),
				headers: auth_header()
			}).then(JSON.parse)
	]).then(results => {
	  var clients = results[0];
	  for (var i = 0; i < clients.length; i++) {
		  add_client_group(clients[i].name, clients[i].id);
	  }

	  var projects = results[1].data.projects;
		var projects_strings = {};
		for (var i = 0; i < projects.length; i++) {
			var project = projects[i];
			if (project.server_deleted_at) continue;
			var p_string = '<span id="p_' + project.id + '" class="pill">'
					+ '<span class="color_marker" style="background-color: ' + project.hex_color + '">'
					+ '</span>' + project.name + '</span>';
			if (project.cid) {
				projects_strings[project.cid] = (projects_strings[project.cid] || '') + p_string;
			} else {
				projects_strings[NO_PROJECT_PID] = (projects_strings[NO_PROJECT_PID] || '') + p_string;
			}
		}

		for (var cid in projects_strings) {
			if (cid === NO_PROJECT_PID
					&& $('#projects_section div[data-cid="' + NO_PROJECT_PID + '"]').length == 0) {
				add_client_group('Other', NO_PROJECT_PID);
			}
			$('#projects_section div[data-cid="' + cid + '"]').html(projects_strings[cid]);
		}
	});
	
	Promise.all([current_entry, render_ui]).then(results => {
	  $('#loading_glass').hide();
	});
	
  var historical_entries = makeRequest({
    method: 'GET',
    url: 'https://www.toggl.com/api/v8/time_entries?' + user_params(),
    headers: auth_header()
  }).then(JSON.parse).then(function(entries) {
    for (var i = 0; i < entries.length; i++) {
			var entry = entries[i];
			var pid = entry.pid || NO_PROJECT_PID;
			if (entries_map[pid] === undefined) {
				entries_map[pid] = new Set();
			}
			entries_map[pid].add(entry.description);
		}
  });
  
  Promise.all([render_ui, historical_entries]).then(() => {
    $('span[id^="p_"]').click(function() {
			$('#project_header_text').html(this.innerText);
			var color = $(this).find('div').css('background-color');
			$('#project_header_color').css('background-color', color);
			$('body').css('background-color', 'rgba' + String(color).slice(3, -1) + ', .1)');
			$('#projects_section').hide();
			show_entries(this.id.substr(2));
		});
  });
}