// Run a node.js web server for local development of a static web site. Create a
// site folder, put server.js in it, create a sub-folder called "public", with
// at least a file "index.html" in it. Start the server with "node server.js &",
// and visit the site at the address printed on the console.
//     The server is designed so that a site will still work if you move it to a
// different platform, by treating the file system as case-sensitive even when
// it isn't (as on Windows and some Macs). URLs are then case-sensitive.
//     All HTML files are assumed to have a .html extension and are delivered as
// application/xhtml+xml for instant feedback on XHTML errors. Content
// negotiation is not implemented, so old browsers are not supported. Https is
// not supported. Add to the list of file types in defineTypes, as necessary.
"use strict";

// Change the port to the default 80, if there are no permission issues and port
// 80 isn't already in use. The root folder corresponds to the "/" url.
let port = 80;
let root = "./public";

// Load the library modules, and define the global constants and variables.
// Load the promises version of fs, so that async/await can be used.
// See http://en.wikipedia.org/wiki/List_of_HTTP_status_codes.
// The file types supported are set up in the defineTypes function.
// The paths variable is a cache of url paths in the site, to check case.
let http = require("http");
let sqlite = require("sqlite");
let qs = require("querystring");
let fs = require("fs").promises;
let OK = 200, NotFound = 404, BadType = 415, Error = 500;
let types, paths;
let data_db = "./data_db.sqlite";
let contact_db = "./contact_db.sqlite"
let meta_db = "./meta_db.sqlite"
let stories_list = [];

// Start the server:
start();

// Check the site, giving quick feedback if it hasn't been set up properly.
// Start the http service. Accept only requests from localhost, for security.
// If successful, the handle function is called for each request.
async function start() {
    try {
        stories_list = await load_stories();
        if (!(stories_list && stories_list.length)) throw("Failed to load stories");
        await fs.access(root);
        await fs.access(root + "/index.html");
        types = defineTypes();
        paths = new Set();
        paths.add("/");
        let service = http.createServer(handle);
        service.listen(port, "localhost");
        let address = "http://localhost";
        if (port != 80) address = address + ":" + port;
        console.log("Server running at", address);
    }
    catch (err) { console.log(err); process.exit(1); }
}

// Serve a request by delivering a file.
async function handle(request, response) {
    let url = request.url;
    let params = "";
    let params_loc = url.lastIndexOf("?");
    if (params_loc != -1) {
      params = url.substring(params_loc + 1);
      url = url.substring(0, params_loc);
    }
    if (url.endsWith("/")) url = url + "index.html";
    let ok = await checkPath(url);
    if (! ok) return fail(response, NotFound, "URL not found (check case)");
    let type = findType(url);
    if (type == null) return fail(response, BadType, "File type not supported");
    let file = root + url;
    let content = "";

    if (request.method == 'POST' & params != "") {
      return handle_post(response, request, params, url);
    } else if (request.method == 'GET' & params != "" & !url.includes("stories"))  {
      return handle_get(response, request, params, url);
    } else {
      content = await fs.readFile(file);
      [content, type] = await handle_file(content, file, type, params);
    }
    deliver(response, type, content);
}

// Check if a path is in or can be added to the set of site paths, in order
// to ensure case-sensitivity.
async function checkPath(path) {
    if (! paths.has(path)) {
        let n = path.lastIndexOf("/", path.length - 2);
        let parent = path.substring(0, n + 1);
        let ok = await checkPath(parent);
        if (ok) await addContents(parent);
    }
    return paths.has(path);
}

// Add the files and subfolders in a folder to the set of site paths.
async function addContents(folder) {
    let folderBit = 1 << 14;
    let names = await fs.readdir(root + folder);
    for (let name of names) {
        let path = folder + name;
        let stat = await fs.stat(root + path);
        if ((stat.mode & folderBit) != 0) path = path + "/";
        paths.add(path);
    }
}

// Find the content type to respond with, or undefined.
function findType(url) {
    let dot = url.lastIndexOf(".");
    let extension = url.substring(dot + 1);
    return types[extension];
}

// Deliver the file that has been read in to the browser.
function deliver(response, type, content) {
    let typeHeader = { "Content-Type": type };
    response.writeHead(OK, typeHeader);
    response.write(content);
    response.end();
}

// Give a minimal failure response to the browser
function fail(response, code, text) {
    let textTypeHeader = { "Content-Type": "text/plain" };
    response.writeHead(code, textTypeHeader);
    response.write(text, "utf8");
    response.end();
}

// The most common standard file extensions are supported, and html is
// delivered as "application/xhtml+xml".  Some common non-standard file
// extensions are explicitly excluded.  This table is defined using a function
// rather than just a global variable, because otherwise the table would have
// to appear before calling start().  NOTE: add entries as needed or, for a more
// complete list, install the mime module and adapt the list it provides.
function defineTypes() {
    let types = {
        html : "application/xhtml+xml",
        css  : "text/css",
        js   : "application/javascript",
        mjs  : "application/javascript", // for ES6 modules
        png  : "image/png",
        gif  : "image/gif",    // for images copied unchanged
        jpeg : "image/jpeg",   // for images copied unchanged
        jpg  : "image/jpeg",   // for images copied unchanged
        svg  : "image/svg+xml",
        json : "application/json",
        pdf  : "application/pdf",
        txt  : "text/plain",
        ttf  : "application/x-font-ttf",
        woff : "application/font-woff",
        aac  : "audio/aac",
        mp3  : "audio/mpeg",
        mp4  : "video/mp4",
        webm : "video/webm",
        ico  : "image/x-icon", // just for favicon.ico
        xhtml: undefined,      // non-standard, use .html
        htm  : undefined,      // non-standard, use .html
        rar  : undefined,      // non-standard, platform dependent, use .zip
        doc  : undefined,      // non-standard, platform dependent, use .pdf
        docx : undefined,      // non-standard, platform dependent, use .pdf
    }
    return types;
}


// Load stories_list from stories in meta_db
// Returns a list of stories or empty list if failed
async function load_stories() {
  var stories = [];
  try {
      var db = await sqlite.open(meta_db);
      var as = await db.all("select name from stories");
      stories = as.map(as => as.name);
  } catch (e) { console.log(e); }
  return stories;
}

// TODO HANDLE EVERY PAGE
// Every page - add stories_list
// Homepage - Load js dependent on stories list
// About - Load data organisation
// Data - Load data organisation
// Contact - Load form correctness
// Stories - Load vis or template if not implemented

// Dynamically alter the content for a given file
// Content is the content of the file at path File
// Type is the type of file e.g. .html or .pdf
// Params are any parameters given in the URL or an empty string
async function handle_file(content, file, type, params) {
  var content_str = content.toString("utf8");
  var page = file.match("/[^/]*/(?!.*/)")[0].slice(1, -1); // Directory of file

  if ("application/xhtml+xml" == type) {
    if (page != "public") content_str = await add_header_and_footer(content_str, page);
    content_str = handle_stories_dropdown(content_str);
    if (page == "public") content_str = handle_file_public(content_str, type, params);
    if (page == "stories") content_str = await handle_file_stories(content_str, type, params);

    // In lieu of qs
    var param_dict = params.split("&");
    param_dict = param_dict.reduce((acc, x) => {
      acc[x.split("=")[0]] = x.split("=")[1];
      return acc;
    }, []);

    if (page == "stories" & Object.keys(param_dict).length > 1) {
      switch (param_dict.s) {
        case "one_earth":
          content_str = "One Earth";
          console.log(content_str);
          // content_str = handle_one_earth(param_dict);
          break;
        case "the_passage_of_time":
          content_str = await handle_the_passage_of_time(param_dict);
          type = "application/json";
          break;
        default:
          break;
      }
    }

    content = Buffer.from(content_str, "utf-8");
  }

  return [content, type];
}

// Load stories into dropdown menu
function handle_stories_dropdown(content) {
  var dropdown_html = "";
  for (let s of stories_list) {
    var s_page = s.toLowerCase().replace(/[^\w\s]/g, "").replace(/ /g, "_");
    var s_html = ('<a class="dropdown-item" href="/stories/\?s=$">£</a>').replace("$", s_page).replace("£", s);
    dropdown_html = dropdown_html.concat(s_html);
  }

  content = content.replace("<!-- $handle_stories_dropdown -->", dropdown_html);
  return content;
}

// Add header and footer files if not homepage
async function add_header_and_footer(content_str, page) {
  let header = await fs.readFile("public/page_navbar.html");
  var header_str = header.toString("utf8");
  let footer = await fs.readFile("public/page_footer.html");
  var footer_str = footer.toString("utf8");
  content_str = content_str.replace("<!-- $page_header -->", header_str);
  content_str = content_str.replace("<!-- $page_footer -->", footer_str);
  content_str = content_str.replace("<!-- $page_name -->", page.charAt(0).toUpperCase() + page.slice(1));
  return content_str;
}

// Handle a public file
function handle_file_public(content, type, params) {
  return content;
}

async function handle_post(response, request, params, url) {
  if (url != "/contact/index.html" || params != "submit"){
    return fail(response, BadType, "Bad URL format.");
  }

  var content = "";
  request.on('data', chunk => {
    content += chunk.toString();
  });
  request.on('end', () => {
      content = qs.parse(content);
      if (!validate_post_content(content)) return fail(response, BadType, "Bad form input.");
      return insert_message_into_db(response, content);
  });

  return;
}

function validate_post_content(content) {
  return verify_content_length(content.name, 5, 50) &
        verify_content_length(content.email, 7, 50) &
        verify_content_length(content.subject, 10, 50) &
        verify_content_length(content.message, 20, 280) &
        verify_email(content.email) &
        verify_no_sql(content.name) &
        verify_no_sql(content.email) &
        verify_no_sql(content.subject) &
        verify_no_sql(content.message);
}

// Check that object is correct length
function verify_content_length(content, minLength, maxLength) {
  return (content.length >= minLength & content.length <= maxLength);
}

// Check that email is valid and not sql
function verify_email(email_string) {
  const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return (re.test(email_string));
}

// Check for possible sql injection
function verify_no_sql(content) {
  const banned_words = ["SELECT", "DROP", "UPDATE", "UNION", "ALTER", "CREATE", "DELETE", "EXISTS", "EXEC", "INSERT", "JOIN", "ORDER", "TRUNCATE"];
  return !banned_words.reduce((acc, b) =>  acc || content.includes(b) , 0);
}

async function insert_message_into_db(response, content) {
  try {
      var db = await sqlite.open(contact_db);
      var as = await db.all("select contact_id from messages order by contact_id desc limit 1");
      var maxid = as[0].contact_id;
      var date = new Date();
      var now = date.getFullYear() + "/" + (date.getMonth()+1) + "/" + date.getDate();
      await db.run("insert into messages values (?, ?, ?, ?, ?, ?)", [maxid + 1, now, content.name, content.email, content.subject, content.message]);
  } catch (e) { console.log(e); return fail(response, Error, "Database error."); }
  return deliver(response, "text/plain", "");
}

async function handle_file_stories(content, type, params) {
  if (type != "application/xhtml+xml") {
    return content;
  };

  if (params.includes("one_earth")){
    content = content.replace('<!-- $story_js -->', '<script type = "text/javascript" src = "/stories/one_earth.js" defer="defer"></script>');
  } else if (params.includes("the_passage_of_time")) {
    content = content.replace('<!-- $story_js -->', '<script type = "text/javascript" src = "/stories/the_passage_of_time.js" defer="defer"></script>');
    //var extra_html = await fs.readFile("./public/stories/the_passage_of_time.html");
    //content = content.replace('<!-- $story_html -->', extra_html.toString('utf8'));
  } else {
    content = content.replace('<!-- $story_js -->', '<script type = "text/javascript" src = "/stories/default.js" defer="defer"></script>');
  }

  return content;
}

function handle_get(response, request, params, url) {
  if (url != "/contact/index.html" || params != "submit"){}
  switch(url + '?' + params) {
      case "/index.html?stories":
        return deliver(response, "text/plain", stories_list.toString());
        break;
      case "/about/index.html?categories":
        get_categories(response);
        break;
      case "/data/index.html?categories":
        get_categories_data(response);
        break;
      default:
        return fail(response, BadType, "Bad URL format.");
        break;
  }

  return;
}

async function get_categories(response) {
  try {
      var db = await sqlite.open(meta_db);
      var as = await db.all("select * from categories");
  } catch (e) { console.log(e); return fail(response, Error, "Database error."); }
  return deliver(response, "application/json", JSON.stringify(as));
}

async function get_categories_data(response) {
  try {
      var db = await sqlite.open(meta_db);
      var as = await db.all("select * from categories");
      db = await sqlite.open(data_db);
      for (var index = 0; index < as.length; index ++) {
        var sources= await db.all("select * from sources where category_id = ?", as[index].category_id);
        as[index].sources = [];
        for (var ind = 0; ind <sources.length; ind++) {
          as[index].sources.push(JSON.stringify(sources[ind]));
        }
      }
  } catch (e) { console.log(e); return fail(response, Error, "Database error."); }
  return deliver(response, "text/plain", JSON.stringify(as));
}

async function handle_the_passage_of_time(param_dict) {
  try {
      var db = await sqlite.open(data_db);
      var content = [];

      // Get case data for countries & country name
      for (let country_id = 0; country_id < 195; country_id++) {
        try {
          var as = await db.all('select * from cases_country_' + country_id);
          var country = await db.all('select name from countries where country_id = ?', country_id);
          content.push({ country : country[0].name, data : as});
        } catch (e) {console.log("No data for country with id " + country_id);}
      }

      // Get sources
      var sources = await db.all('select source_id, author, reference_link from sources');
      for (var country in content) {
        for (var date in content[country].data) {
          var source_id = content[country].data[date].source_id;
          content[country].data[date].source_author = sources[source_id].author;
          content[country].data[date].source_link = sources[source_id].reference_link;
          delete content[country].data[date].source_id;
        }
      }

  } catch (e) { console.log(e); return {"ERROR" : "FAIL"}; }
  return JSON.stringify(content);
}
