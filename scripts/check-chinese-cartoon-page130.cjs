const fs=require('fs');const code=fs.readFileSync('scripts/check-cartoon-mentor.cjs','utf8').replace('/?tour=1&auto=0&avatar=cartoon','/?tour=1&auto=0&lang=zh');new Function('require',code)(require);
