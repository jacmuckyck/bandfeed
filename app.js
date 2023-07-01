require("dotenv").config();
const express = require("express");
const https = require("https");
const http = require("http");
const app = express();
const myKeyPath = process.env.myKey;
const myCertPath = process.env.myCert;
const options = { key: myKeyPath, cert: myCertPath };
const myPort1 = process.env.myPort1;
const myPort2 = process.env.myPort2;
const redirectMiddleware = require("./redirectMiddleware");

const { createPool } = require("mysql2/promise");
const pool = createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

https.createServer(options, app).listen(myPort1, () => {});
http.createServer(app).listen(myPort2, () => {});

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(redirectMiddleware);
app.get(["/", "/index"], async (req, res) => {
    const connection = await pool.getConnection();
    const [main] = await connection.query(
        "SELECT *, DATE_FORMAT(date, '%d %m %Y') AS formatted_date FROM main ORDER BY date DESC"
    );
    connection.release();
    res.render("index", { main });
});

app.get("/loved", async (req, res) => {
    const connection = await pool.getConnection();
    const [loved] = await connection.query(
        "SELECT *, DATE_FORMAT(date, '%d %m %Y') AS formatted_date FROM love ORDER BY date DESC"
    );
    connection.release();
    res.render("loved", { loved });
});

app.get("/archive", async (req, res) => {
    const connection = await pool.getConnection();
    const [archive] = await connection.query(
        "SELECT *, DATE_FORMAT(date, '%d %m %Y') AS formatted_date FROM archive ORDER BY date DESC"
    );
    connection.release();
    res.render("archive", { archive });
});

app.post("/love/:body", async (req, res) => {
    const emailID = req.params.body; // Use req.params.body to retrieve the parameter value
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(
        `INSERT INTO love (sender, subject, body, date) SELECT sender, subject, body, date FROM main WHERE body = ?`,
        [emailID]
    );
    await connection.query("DELETE FROM main WHERE body = ?", [emailID]);
    await connection.commit();
    connection.release();
    res.redirect("/");
});

app.post("/archive/:body", async (req, res) => {
    const emailID = req.params.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(
        "INSERT INTO archive (sender, subject, body, date) SELECT sender, subject, body, date FROM main WHERE body = ?",
        [emailID]
    );
    await connection.query("DELETE FROM main WHERE body = ?", [emailID]);
    await connection.query("DELETE FROM love WHERE body = ?", [emailID]);
    await connection.commit();
    connection.release();
    res.redirect("/");
});

app.post("/archivee/:body", async (req, res) => {
    const emailID = req.params.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(
        "INSERT INTO archive (sender, subject, body, date) SELECT sender, subject, body, date FROM love WHERE body = ?",
        [emailID]
    );
    await connection.query("DELETE FROM love WHERE body = ?", [emailID]);
    await connection.commit();
    connection.release();
    res.redirect("/loved"); // Redirect to the "/love" route
});

app.post("/lovee/:body", async (req, res) => {
    const emailID = req.params.body;
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(
        `INSERT INTO love (sender, subject, body, date) SELECT sender, subject, body, date FROM archive WHERE body = ?`,
        [emailID]
    );
    await connection.query("DELETE FROM archive WHERE body = ?", [emailID]);
    await connection.commit();
    connection.release();
    res.redirect("/archive"); // Redirect to the "/archive" route
});

app.listen(() => {
    console.log(`Server running at http://localhost:3000`);
});
