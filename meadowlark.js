var express = require("express");
var bodyParser = require("body-parser");
var formidable = require("formidable");
var nodemailer = require("nodemailer");
var fortune = require("./lib/fortune.js");
var weather = require("./lib/weather.js");
var credentials = require("./credentials.js");
var emailService = require("./lib/email.js")(credentials);

var app = express();

var handlebars = require("express3-handlebars").create({
    defaultLayout: "main",
    helpers: {
        section: function(name, options) {
            if (!this._sections) this._sections = {};
            this._sections[name] = options.fn(this);
            return null;
        }
    }
});

var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
function NewsletterSignup(){
}
NewsletterSignup.prototype.save = function(cb){
    cb();
};

app.use(require("cookie-parser")(credentials.cookieSecret));
app.use(require("express-session")());

app.use(function(req, res, next) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

app.use(function(req, res, next) {
    res.locals.showTests = app.get("env") !== "production" &&
        req.query.test === "1";
    next();
});

app.use(function(req, res, next) {
    if(!res.locals.partials) res.locals.partials = {};
    res.locals.partials.weather = weather.getWeatherData();
    next();
});

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.engine("handlebars", handlebars.engine);

app.set("view engine", "handlebars");

app.set("port", process.env.PORT || 3000);

app.use(express.static(__dirname + "/public"));

app.get("/", function(req, res) {
    var monster = req.cookies.monster;
    var signedMonster = req.signedCookies.signed_monster;
    console.log(monster);
    console.log(signedMonster);
    res.render("home");
    res.cookie("monster", "nom nom");
    res.cookie("signed_monster", "-nom nom", {signed: true, maxAge: 10000000000});
});

app.get("/about", function(req, res) {
    res.render("about", {
        fortune: fortune.getFortune(),
        pageTestScript: "/qa/tests-about.js",
    });
});

app.get("/tours/hood-river", function(req, res) {
    res.render("tours/hood-river");
});

app.get("/tours/oregon-coast", function(req, res) {
    res.render("tours/oregon-coast");
});

app.get("/tours/request-group-rate", function(req, res) {
    res.render("tours/request-group-rate");
});

app.get("/jquerytest", function(req, res) {
    res.render("jquerytest");
});

app.get("/nursery-rhyme", function(req, res) {
    res.render("nursery-rhyme");
});

app.get("/data/nursery-rhyme", function(req, res) {
    res.json({
        animal: "squirrel",
        bodyPart: "tail",
        adjective: "bushy",
        noun: "heck"
    });
});

app.get("/thank-you", function(req, res) {
    res.render("thank-you");
});

app.get("/newsletter", function(req, res) {
    res.render("newsletter", {csrf: "CSRF token goes here"});
});

app.post("/newsletter", function(req, res) {
    var name = req.body.name || "", email = req.body.email || "";
    if(!email.match(VALID_EMAIL_REGEX)) {
        if(req.xhr) return res.json({error: "Invalid name email address."});
        req.session.flash = {
            type: "danger",
            intro: "Validation error!",
            message: "The email address you entered was not valid.",
        };
        return res.redirect(303, "/newsletter/archive");
    }
    new NewsletterSignup({name: name, email: email}).save(function(err) {
        if(err) {
            if(req.xhr) return res.json({error: "Database error."});
            req.session.flash = {
                type: "danger",
                intro: "Database error!",
                message: "There was a database error; please try again later.",
            };
            return res.redirect(303, "/newsletter/archive");
        }
        if(req.xhr) return res.json({success: true});
        req.session.flash = {
            type: "success",
            intro: "Thank you!",
            message: "You have now been signed up for the newsletter.",
        };
        return res.redirect(303, "/newsletter/archive");
    });
});

app.post("/process", function(req, res) {
    if(req.xhr || req.accepts("json,html") === "json") {
        // 如果发生错误,应该发送 { error: 'error description' }
        res.send({success: true});
    } else {
        // // 如果发生错误,应该重定向到错误页面
        res.redirect(303, "/thank-you");
    }
});

app.get("/newsletter/archive", function(req, res) {
    res.render("newsletter/archive");
});

app.get("/contest/vacation-photo", function(req, res) {
    var now = new Date();
    res.render("contest/vacation-photo", {
        year: now.getFullYear(), month: now.getMonth()
    });
});

app.post("/contest/vacation-photo/:year/:month", function(req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        if(err) return res.redirect(303, "/error");
        console.log("received fields: ");
        console.log(fields);
        console.log("received files:");
        console.log(files);
        res.redirect(303, "/thank-you");
    });
});

app.post("/cart/checkout", function(req, res) {
    var cart = req.session.cart;
    if(!cart) next(new Error("Cart does not exist."));
    var name = req.body.name || "", email = req.body.email || "";
    if(!email.match(VALID_EMAIL_REGEX))
        return res.next(new Error("Invalid email address."));
    cart.number = Math.random().toString().replace(/^0\.0*/, "");
    cart.billing = {
        name: name,
        email: email
    };
    res.render("email/cart-thank-you",
        {layout: null, cart: cart}, function(err, html) {
            if(err) {
                console.log("error in email template");
            }
            emailService.send(cart.billing.email,
                "Thank you for book your trip with Meadowlark", html);
        }
    );
    res.render("cart-thank-you", {cart: cart});
})

// 404
app.use(function(req, res) {
    res.status(404);
    res.render("404");
});

// 500
app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500);
    res.render("500");
});

app.listen(app.get("port"), function() {
    console.log("Express started on http://localhost:" +
        app.get("port") + "; press Ctrl-C to terminate.");
});
