var email, api_token, workspace;
var entries_map = {}; // PID -> [task_descriptions*]
var NO_PROJECT_PID = "no_project";
	
function verify_credentials(_email, _api_token) {
  xhr = new XMLHttpRequest();
  xhr.open("GET", "https://www.toggl.com/api/v8/me?user_agent=" + _email, false);
  xhr.setRequestHeader('Authorization', 'Basic ' + btoa(_api_token + ':api_token'));
  xhr.send();
  if(xhr.status !== 200) {
    // What if shake didn't load yet?
    $('#login_dialog').shake({speed: 80});
    return false;
  } else {
    var response = JSON.parse(xhr.response);
    email = _email;
    api_token = _api_token;
    workspace = response.data.workspaces[0].id;
    return true;
  }
}

function add_client_group(name, id) {
  $('#projects_section').append('<div class="client_group"><h1>' + name + '</h1>' +
    '<div class="pill_container" data-cid="' + id + '"></div></div>');
}

$('#login_button').click(function() {
  if (verify_credentials($('#email_input').val(), $('#api_token_input').val())) {
    $('#login_glass').fadeOut();
    run_ui();
  }
});

function close_entries() {
  $('#entries_section').hide();
  $('#projects_section').fadeIn();
  $('body').css('background-color', 'rgb(236, 236, 236)');
}

function show_entries(pid) {
  var entries_string = "";
  for (let task_description of (entries_map[pid] || [])) {
    entries_string += '<span class="pill" data-entry>' + task_description + '</span>';
  }
  $('#entries').html(entries_string);
  $('#entries').attr('data-project', pid);
  $('#entries_section').fadeIn();
  
  $('span[data-entry=""]').click(function() {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "https://www.toggl.com/api/v8/time_entries/start?user_agent=" + email + "&workspace_id=" + workspace, false);
    xhr.setRequestHeader('Authorization', 'Basic ' + btoa(api_token + ':api_token'));
    xhr.send('{"time_entry":{"description":"' + this.innerText + '","pid":' + this.parentNode.getAttribute('data-project') + ',"created_with":"QuickToggl"}}');
    console.log(xhr.response);
    close_entries();
    // Error handling.
    // Update current task UI if success.
  });
}

function run_ui() {

	var xhr = new XMLHttpRequest();
	xhr.open("GET", "https://www.toggl.com/api/v8/time_entries/current?user_agent=" + email + "&workspace_id=" + workspace, false);
	xhr.setRequestHeader('Authorization', 'Basic ' + btoa(api_token + ':api_token'));
	xhr.send();
	var response = JSON.parse(xhr.response);
	$('#app_header').html('Currently: ' + (response.data ? response.data.description : 'No running project'));

	xhr = new XMLHttpRequest();
	xhr.open("GET", "https://www.toggl.com/api/v8/clients?user_agent=" + email + "&workspace_id=" + workspace, false);
	xhr.setRequestHeader('Authorization', 'Basic ' + btoa(api_token + ':api_token'));
	xhr.send();
	var clients = JSON.parse(xhr.response);

	for (var i = 0; i < clients.length; i++) {
		add_client_group(clients[i].name, clients[i].id);
	}
	
	xhr = new XMLHttpRequest();
	xhr.open("GET", "https://www.toggl.com/api/v8/time_entries?user_agent=" + email + "&workspace_id=" + workspace, false);
	xhr.setRequestHeader('Authorization', 'Basic ' + btoa(api_token + ':api_token'));
	xhr.send();

	entries = JSON.parse(xhr.response);
	for (var i = 0; i < entries.length; i++) {
		var entry = entries[i];
		var pid = entry.pid || NO_PROJECT_PID;
		if (entries_map[pid] === undefined) {
			entries_map[pid] = new Set();
		}
		entries_map[pid].add(entry.description);
	}

	$('#project_close').click(close_entries);

	xhr = new XMLHttpRequest();
	xhr.open("GET", "https://www.toggl.com/api/v8/me?with_related_data=true&user_agent=" + email + "&workspace_id=" + workspace, false);
	xhr.setRequestHeader('Authorization', 'Basic ' + btoa(api_token + ':api_token'));
	xhr.send();
	response = JSON.parse(xhr.response);
	var projects = response.data.projects;
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

	$('span[id^="p_"]').click(function() {
		$('#project_header_text').html(this.innerText);
		var color = $(this).find('div').css('background-color');
		$('#project_header_color').css('background-color', color);
		$('body').css('background-color', 'rgba' + String(color).slice(3, -1) + ', .1)');
		$('#projects_section').hide();
		show_entries(this.id.substr(2));
	});
}