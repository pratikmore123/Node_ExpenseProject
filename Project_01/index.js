const express = require("express");
const users =require("./MOCK_DATA.json");

const app=express();
const PORT=8000;

app.get('/users',(req,res)=>
{
    return res.json(users)
})
app.listen(PORT,()=>console.log(`Server Started at Port: ${PORT}`));