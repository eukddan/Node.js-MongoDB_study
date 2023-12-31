const express = require("express");
const app = express();
const { MongoClient, ObjectId } = require("mongodb");
const methodOverride = require("method-override");
const bcrypt = require("bcrypt");
const MongoStore = require("connect-mongo");
require("dotenv").config();

app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");

app.use(passport.initialize());
app.use(
  session({
    secret: "암호화에 쓸 비번",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 },
    store: MongoStore.create({
      mongoUrl:
        "mongodb+srv://admin:qwer1234@cluster0.qggcv0f.mongodb.net/?retryWrites=true&w=majority",
      dbName: "forum",
    }),
  })
);

app.use(passport.session());

const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = new S3Client({
  region: "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "eukddan",
    key: function (req, file, cb) {
      cb(null, Date.now().toString()); //업로드시 파일명 변경가능
    },
  }),
});

let db;
const url = process.env.DB_URL;
new MongoClient(url)
  .connect()
  .then((client) => {
    console.log("DB연결성공");
    db = client.db("forum");
    app.listen(process.env.PORT, () => {
      console.log("http://localhost:8080 에서 서버 실행 중");
    });
  })
  .catch((err) => {
    console.log(err);
  });

passport.use(
  new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    try {
      let result = await db
        .collection("user")
        .findOne({ username: 입력한아이디 });
      if (!result) {
        return cb(null, false, { message: "아이디 DB에 없음" });
      }
      if (await bcrypt.compare(입력한비번, result.password)) {
        return cb(null, result);
      } else {
        return cb(null, false, { message: "비번불일치" });
      }
    } catch (error) {
      console.log(error);
      res.status(500).send("서버 에러");
    }
  })
);

passport.serializeUser((user, done) => {
  console.log(user);
  process.nextTick(() => {
    done(null, { id: user._id, username: user.username });
  });
});

passport.deserializeUser(async (user, done) => {
  let result = await db
    .collection("user")
    .findOne({ _id: new ObjectId(user.id) });
  delete result.password;
  process.nextTick(() => {
    return done(null, result);
  });
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/news", (요청, 응답) => {
  db.collection("post").insertOne({ title: "어쩔티비" });
  //   응답.send("오늘 비옴");
});

app.get("/list", async (요청, 응답) => {
  let result = await db.collection("post").find().limit(5).toArray();
  응답.render("list.ejs", { posts: result });
});

app.get("/write", (req, res) => {
  res.render("write.ejs");
});

app.post("/newpost", async (req, res) => {
  upload.single("img1")(req, res, async (err) => {
    let a = req.body.title;
    let b = req.body.content;
    let c = req.user.username;
    let dup = await db.collection("user").findOne({ username: c });
    if (err) return res.send("업로드 오류");
    try {
      if (req.body.title == "" || req.body.content == "") {
        res.send("다시 입력하세요");
      } else if (dup) {
        await db
          .collection("post")
          .insertOne({ title: a, content: b, img: req.file.location });
        res.redirect("/list");
      } else {
        console.log(c);
        console.log(dup);
        res.send("로그인 후 이용하세요.");
      }
    } catch (error) {
      console.log(error);
      res.status(500).send("서버 에러");
    }
  });
});

app.get("/detail/:id", async (req, res) => {
  try {
    let user = req.params;
    let result = await db
      .collection("post")
      .findOne({ _id: new ObjectId(user.id) });
    if (result == null) {
      res.status(400).send("그런 게시글 여기 없수다");
    }
    res.render("detail.ejs", { result: result });
  } catch (error) {
    res.send("이상한 거 넣지마셈");
  }
});

app.get("/edit/:id", async (req, res) => {
  let user = req.params;
  let result = await db
    .collection("post")
    .findOne({ _id: new ObjectId(user.id) });
  // console.log(result);
  res.render("edit.ejs", { result: result });
});

app.put("/editpost", async (req, res) => {
  let a = req.body.title;
  let b = req.body.content;
  let c = req.body.id;
  // let c1 = db.collection("post").findOne({ _id: new ObjectId(c) });
  // console.log(c1);
  try {
    if (a == "" || b == "") {
      res.send("다시 입력하세요");
    } else {
      await db
        .collection("post")
        .updateOne(
          { _id: new ObjectId(c) },
          { $set: { title: a, content: b } }
        );
      res.redirect("/list");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("서버 에러");
  }
});

app.delete("/delete", async (req, res) => {
  console.log(req.query.docid);
  let result = await db
    .collection("post")
    .deleteOne({ _id: new ObjectId(req.query.docid) });
  res.send("삭제 완료");
});

app.get("/list/:id", async (req, res) => {
  let result = await db
    .collection("post")
    .find()
    .skip((req.params.id - 1) * 5)
    .limit(5)
    .toArray();
  res.render("list.ejs", { posts: result });
});

app.get("/list/next/:id", async (req, res) => {
  let result = await db
    .collection("post")
    .find({ _id: { $gt: new ObjectId(req.params.id) } })
    .limit(5)
    .toArray();
  res.render("list.ejs", { posts: result });
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs");
});

app.post("/signup", async (req, res) => {
  let a = req.body.username;
  let b = req.body.password;
  let c = req.body.password1;
  let hash = await bcrypt.hash(b, 10);
  let dup = await db.collection("user").findOne({ username: a });
  try {
    if (a == "" || b == "") {
      res.send("다시 입력하세요");
    } else if (dup) {
      res.send("중복된 아이디입니다.");
    } else if (b != c) {
      res.send("비밀번호가 일치하지 않습니다.");
    } else {
      console.log(b);
      console.log(c);
      await db.collection("user").insertOne({ username: a, password: hash });
      res.redirect("/login");
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("서버 에러");
  }
});

function checkLogin(req, res, next) {
  let a = req.body.username;
  let b = req.body.password;
  if (a == "") {
    res.send("다시 입력하세요");
  } else if (b == "") {
    res.send("다시 입력하세요");
  } else {
    next();
  }
}

app.post("/login", checkLogin, async (req, res, next) => {
  passport.authenticate("local", (error, user, info) => {
    if (error) return res.status(500).json(error);
    if (!user) return res.status(401).json(info.message);
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect("/mypage");
    });
  })(req, res, next);
});

app.get("/mypage", (req, res) => {
  let result = req.user;
  res.render("mypage.ejs", { result: result });
});

app.get("/search", async (req, res) => {
  let 검색조건 = [
    {
      $search: {
        index: "title_index",
        text: { query: req.query.val, path: "title" },
      },
    },
  ];
  let result = await db.collection("post").aggregate(검색조건).toArray();
  res.render("search.ejs", { posts: result });
});
