const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path'); // Tambahkan di atas, bersama require lainnya

const app = express();
const port = process.env.PORT || 3000;

// Set EJS sebagai view engine dengan path absolut
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // <- pastikan ini ada

// Class Cookpad (sama seperti yang Anda berikan)
class Cookpad {
    search = async function (query) {
        try {
            if (!query) throw new Error('Query is required');
            
            const { data } = await axios.get(`https://cookpad.com/id/cari/${encodeURIComponent(query)}`);
            const $ = cheerio.load(data);
            const recipes = [];
            
            $('li[id^="recipe_"]').each((index, element) => {
                const recipeId = $(element).attr('id').replace('recipe_', '');
                const title = $(element).find('a.block-link__main').text().trim();
                const imageUrl = $(element).find('picture img[fetchpriority="auto"]').attr('src');
                const author = $(element).find('.flex.items-center.mt-auto span.text-cookpad-gray-600').text().trim();
                const prepTime = $(element).find('.mise-icon-time + .mise-icon-text').text().trim() || null;
                const servings = $(element).find('.mise-icon-user + .mise-icon-text').text().trim() || null;
                const ingredients = $(element).find('[data-ingredients-highlighter-target="ingredients"]').text().split(',').map(item => item.replace(/\s+/g, ' ').trim()).filter(item => item.length > 0);
                const url = `https://cookpad.com/id/resep/${recipeId}`;
                
                recipes.push({
                    id: recipeId,
                    title: title,
                    imageUrl: imageUrl,
                    author: author,
                    prepTime: prepTime,
                    servings: servings,
                    ingredients: ingredients,
                    url
                });
            });
    
            return recipes;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    detail = async function (url) {
        try {
            if (!url.includes('cookpad.com')) throw new Error('Invalid url');
            
            const { data } = await axios.get(url);
            const $ = cheerio.load(data);
            let recipeData = {};
            
            const ldJsonScript = $('script[type="application/ld+json"]').toArray().map(element => {
                try {
                    return JSON.parse($(element).text());
                } catch (e) {
                    return null;
                }
            }).filter(json => json && json['@type'] === 'Recipe');
            if (ldJsonScript.length < 0) throw new Error('Recipe not found');
            
            const recipeLd = ldJsonScript[0];
            
            recipeData.id = recipeLd.url ? recipeLd.url.split('/').pop() : null;
            recipeData.title = recipeLd.name || $('h1.break-words').text().trim();
            
            if (recipeLd.author && recipeLd.author['@type'] === 'Person') {
                recipeData.author = {
                    name: recipeLd.author.name,
                    username: $('a[href*="/pengguna/"] span[dir="ltr"]').first().text().trim() || null,
                    url: recipeLd.author.url
                };
            }
            
            recipeData.imageUrl = recipeLd.image || $('meta[property="og:image"]').attr('content');
            recipeData.description = recipeLd.description || $('meta[name="description"]').attr('content');
            recipeData.servings = recipeLd.recipeYield || null;
            recipeData.prepTime = $('div[id*="cooking_time_recipe_"] span.mise-icon-text').first().text().trim() || null;
            recipeData.ingredients = recipeLd.recipeIngredient || [];
            recipeData.steps = (recipeLd.recipeInstructions || []).map(step => ({
                text: step.text,
                images: step.image || []
            }));
            recipeData.datePublished = recipeLd.datePublished;
            recipeData.dateModified = recipeLd.dateModified;
            
            return recipeData;
        } catch (error) {
            throw new Error(error.message);
        }
    }
}

const cookpad = new Cookpad();

// Routes
app.get('/', (req, res) => {
    res.render('index', { recipes: null, query: null, error: null });
});

app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.redirect('/');
        }
        
        const recipes = await cookpad.search(query);
        res.render('index', { recipes, query, error: null });
    } catch (error) {
        res.render('index', { recipes: null, query: req.query.q, error: error.message });
    }
});

app.get('/recipe/:id', async (req, res) => {
    try {
        const recipeUrl = `https://cookpad.com/id/resep/${req.params.id}`;
        const recipe = await cookpad.detail(recipeUrl);
        res.render('detail', { recipe, error: null });
    } catch (error) {
        res.render('detail', { recipe: null, error: error.message });
    }
});

module.exports = app;
