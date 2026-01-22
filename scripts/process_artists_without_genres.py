#!/usr/bin/env python3
"""
Process Artists Without Genres CSV file with external identifiers and web scraping
"""

import csv
import json
import time
import requests
import os
import re
import argparse
from typing import List, Optional, Tuple
from bs4 import BeautifulSoup

# API Credentials
SPOTIFY_CLIENT_ID = "00c8ab88043a4d53bc3ec13684885ca9"
SPOTIFY_CLIENT_SECRET = "0c8ae2f4f5b54f1bb5b00511f7da52ad"
LASTFM_API_KEY = "17cbdf1d52cd6f49d3ea93de0e03241e"

def get_spotify_token():
    url = "https://accounts.spotify.com/api/token"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "client_credentials",
        "client_id": SPOTIFY_CLIENT_ID,
        "client_secret": SPOTIFY_CLIENT_SECRET
    }
    try:
        r = requests.post(url, headers=headers, data=data, timeout=10)
        if r.status_code == 200:
            return r.json()["access_token"]
    except:
        pass
    return None

def get_spotify_genres_by_id(spotify_id: str, token: str) -> Tuple[Optional[List[str]], str]:
    """Get genres directly from Spotify using artist ID."""
    url = f"https://api.spotify.com/v1/artists/{spotify_id}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.get(url, headers=headers, params={}, timeout=10)
        if r.status_code == 200:
            artist = r.json()
            genres = artist.get("genres", [])
            if genres:
                return genres[:5], "Spotify"
    except:
        pass
    return None, None

def search_spotify(artist_name: str, token: str) -> Tuple[Optional[List[str]], Optional[str]]:
    url = "https://api.spotify.com/v1/search"
    headers = {"Authorization": f"Bearer {token}"}
    # Try multiple search variations
    search_queries = [
        artist_name,
        artist_name.split('(')[0].strip(),  # Remove parenthetical info
        artist_name.split('–')[0].strip(),  # Remove em-dash separators
        artist_name.split('-')[0].strip(),  # Remove dash separators
    ]
    
    for query in search_queries:
        if not query or len(query) < 2:
            continue
        params = {"q": query, "type": "artist", "limit": 20}  # Increased limit
        try:
            r = requests.get(url, headers=headers, params=params, timeout=10)
            if r.status_code == 200:
                artists = r.json().get("artists", {}).get("items", [])
                # Check all results with more flexible matching
                for artist in artists:
                    artist_name_lower = artist_name.lower().strip()
                    matched_name = artist.get("name", "").lower().strip()
                    
                    # More flexible matching
                    name_variants = [
                        artist_name_lower,
                        artist_name_lower.replace(" ", ""),
                        artist_name_lower.replace("'", ""),
                        artist_name_lower.replace("'", "'"),
                        query.lower().strip(),
                    ]
                    matched_variants = [
                        matched_name,
                        matched_name.replace(" ", ""),
                        matched_name.replace("'", ""),
                        matched_name.replace("'", "'"),
                    ]
                    
                    # Stricter matching - require exact or very close match
                    matches = False
                    
                    # First check: Exact match (case insensitive, ignoring special chars)
                    artist_clean = re.sub(r'[^\w\s]', '', artist_name_lower).strip()
                    matched_clean = re.sub(r'[^\w\s]', '', matched_name).strip()
                    
                    if artist_clean == matched_clean:
                        matches = True
                    # Second check: One contains the other (but require at least 3 chars overlap)
                    elif artist_clean in matched_clean or matched_clean in artist_clean:
                        # Require at least 70% of the shorter name to be in the longer
                        shorter = min(len(artist_clean), len(matched_clean))
                        longer = max(len(artist_clean), len(matched_clean))
                        if shorter >= 3 and longer > 0 and (shorter / longer) >= 0.7:
                            matches = True
                    # Third check: Word-by-word match (for multi-word names)
                    elif len(artist_name_lower.split()) > 1:
                        artist_words = set(w for w in artist_clean.split() if len(w) > 2)
                        matched_words = set(w for w in matched_clean.split() if len(w) > 2)
                        if len(artist_words) >= 2 and len(matched_words) >= 2:
                            # Require at least 80% of words to match
                            common_words = artist_words & matched_words
                            if len(common_words) > 0 and (len(common_words) / len(artist_words)) >= 0.8:
                                matches = True
                    
                    if matches:
                        genres = artist.get("genres", [])
                        if genres:
                            return genres[:5], "Spotify"
        except:
            continue
    return None, None

def search_lastfm(artist_name: str) -> Tuple[Optional[List[str]], Optional[str]]:
    url = "http://ws.audioscrobbler.com/2.0/"
    # Try multiple name variations
    search_names = [
        artist_name,
        artist_name.split('(')[0].strip(),
        artist_name.split('–')[0].strip(),
        artist_name.split('-')[0].strip(),
    ]
    
    for name in search_names:
        if not name or len(name) < 2:
            continue
        params = {
            "method": "artist.gettoptags",
            "artist": name,
            "api_key": LASTFM_API_KEY,
            "format": "json"
        }
        try:
            r = requests.get(url, params=params, timeout=10)
            if r.status_code == 200:
                tags = r.json().get("toptags", {}).get("tag", [])
                if tags:
                    # Filter out non-genre tags
                    genre_tags = []
                    exclude_tags = {'seen live', 'favorites', 'my library', 'under 2000 listeners', 
                                   'seen-live', 'favorite', 'library', 'all', 'rock', 'pop', 'music',
                                   'times', '2 times', 'seen live 2 times'}
                    exclude_terms = ['seen live', 'favorites', 'my library', 'under 2000 listeners', 
                                    'seen-live', 'favorite', 'library', 'all', 'times']
                    for tag in tags[:10]:  # Check more tags
                        tag_name = tag.get("name", "").lower()
                        # Check if tag is in exclude list or contains any exclude term
                        if tag_name and tag_name not in exclude_tags and len(tag_name) > 2:
                            # Also check if tag contains any excluded term
                            if not any(exclude_term in tag_name for exclude_term in exclude_terms):
                                genre_tags.append(tag.get("name", ""))
                    if genre_tags:
                        return genre_tags[:5], "Last.fm"
        except:
            continue
    return None, None

def get_musicbrainz_genres_by_id(musicbrainz_id: str) -> Tuple[Optional[List[str]], str]:
    """Get genres directly from MusicBrainz using artist ID."""
    url = f"https://musicbrainz.org/ws/2/artist/{musicbrainz_id}"
    headers = {"User-Agent": "GenreFiller/1.0", "Accept": "application/json"}
    params = {"inc": "tags", "fmt": "json"}
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if r.status_code == 200:
            artist = r.json()
            tags = artist.get("tags", [])
            if tags:
                sorted_tags = sorted(tags, key=lambda x: x.get("count", 0), reverse=True)
                genre_tags = [tag["name"] for tag in sorted_tags[:5] if tag.get("count", 0) > 0]
                if genre_tags:
                    return genre_tags, "MusicBrainz"
    except:
        pass
    return None, None

def search_musicbrainz(artist_name: str) -> Tuple[Optional[List[str]], Optional[str]]:
    url = "https://musicbrainz.org/ws/2/artist/"
    headers = {"User-Agent": "GenreFiller/1.0", "Accept": "application/json"}
    # Try multiple search queries
    search_queries = [
        f'artist:"{artist_name}"',
        artist_name,
        artist_name.split('(')[0].strip(),
    ]
    
    for query in search_queries:
        params = {"query": query, "limit": 5, "fmt": "json"}  # Check more results
        try:
            r = requests.get(url, headers=headers, params=params, timeout=15)
            if r.status_code == 200:
                artists = r.json().get("artists", [])
                # Check multiple results
                for artist in artists:
                    artist_id = artist.get("id")
                    if artist_id:
                        tags_url = f"https://musicbrainz.org/ws/2/artist/{artist_id}"
                        tags_r = requests.get(tags_url, headers=headers, 
                                            params={"inc": "tags", "fmt": "json"}, timeout=15)
                        if tags_r.status_code == 200:
                            tags = tags_r.json().get("tags", [])
                            if tags:
                                sorted_tags = sorted(tags, key=lambda x: x.get("count", 0), reverse=True)
                                genre_tags = [tag["name"] for tag in sorted_tags[:5] if tag.get("count", 0) > 0]
                                if genre_tags:
                                    return genre_tags, "MusicBrainz"
        except:
            continue
    return None, None

def scrape_allmusic(artist_name: str) -> Tuple[Optional[List[str]], str]:
    """Scrape AllMusic for artist genres."""
    # Try multiple name variations
    search_names = [
        artist_name,
        artist_name.split('(')[0].strip(),
        artist_name.split('–')[0].strip(),
        artist_name.split('-')[0].strip(),
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml"
    }
    
    for name in search_names:
        if not name or len(name) < 2:
            continue
        search_url = f"https://www.allmusic.com/search/artists/{requests.utils.quote(name)}"
        try:
            r = requests.get(search_url, headers=headers, timeout=10)
            if r.status_code == 200:
                soup = BeautifulSoup(r.content, 'html.parser')
                results = soup.find_all('div', class_=re.compile(r'result|artist', re.I))
                artist_link = None
                for result in results[:10]:  # Check more results
                    link = result.find('a', href=re.compile(r'/artist/', re.I))
                    if link:
                        link_text = link.get_text(strip=True).lower()
                        name_lower = name.lower()
                        # More flexible matching
                        if (name_lower in link_text or link_text in name_lower or
                            name_lower.replace(" ", "") in link_text.replace(" ", "") or
                            any(word in link_text for word in name_lower.split() if len(word) > 3)):
                            artist_link = link.get('href')
                            break
                
                if artist_link:
                    if not artist_link.startswith('http'):
                        artist_link = f"https://www.allmusic.com{artist_link}"
                    artist_r = requests.get(artist_link, headers=headers, timeout=10)
                    if artist_r.status_code == 200:
                        artist_soup = BeautifulSoup(artist_r.content, 'html.parser')
                        genre_section = artist_soup.find('section', class_=re.compile(r'genre', re.I))
                        if not genre_section:
                            genre_section = artist_soup.find('div', class_=re.compile(r'genre', re.I))
                        
                        if genre_section:
                            genre_links = genre_section.find_all('a')
                            genres = []
                            for link in genre_links:
                                genre_text = link.get_text(strip=True)
                                if genre_text and len(genre_text) < 30 and genre_text.lower() not in ['genre', 'genres', 'more']:
                                    genres.append(genre_text)
                            if genres:
                                return genres[:5], "AllMusic"
        except:
            continue
    return None, None

def scrape_wikipedia(artist_name: str) -> Tuple[Optional[List[str]], str]:
    """Scrape Wikipedia for artist genre information."""
    search_url = f"https://en.wikipedia.org/wiki/{requests.utils.quote(artist_name.replace(' ', '_'))}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml"
    }
    try:
        r = requests.get(search_url, headers=headers, timeout=10)
        if r.status_code == 200:
            soup = BeautifulSoup(r.content, 'html.parser')
            infobox = soup.find('table', class_='infobox')
            if infobox:
                for row in infobox.find_all('tr'):
                    header = row.find('th')
                    if header and 'genre' in header.get_text().lower():
                        data_cell = row.find('td')
                        if data_cell:
                            genre_links = data_cell.find_all('a')
                            genres = []
                            for link in genre_links:
                                genre_text = link.get_text(strip=True)
                                if genre_text and len(genre_text) < 30:
                                    genres.append(genre_text)
                            if not genres:
                                text = data_cell.get_text(strip=True)
                                potential_genres = re.split(r'[,;•·]', text)
                                genres = [g.strip() for g in potential_genres if g.strip() and len(g.strip()) < 30]
                            if genres:
                                return genres[:5], "Wikipedia"
    except:
        pass
    return None, None

def get_setlistfm_genres_by_id(setlistfm_id: str, artist_name: str = None) -> Tuple[Optional[List[str]], str]:
    """Get genres from Setlist.fm using artist UUID."""
    # Setlist.fm uses UUIDs, try to construct direct URL or search
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml"
    }
    try:
        # Try direct URL with UUID (Setlist.fm format: /artist/[name]-[uuid].html)
        # But we don't have the name slug, so we'll search instead
        if artist_name:
            # Search for artist
            search_url = f"https://www.setlist.fm/search?query={requests.utils.quote(artist_name)}&type=artist"
            r = requests.get(search_url, headers=headers, timeout=10)
            if r.status_code == 200:
                soup = BeautifulSoup(r.content, 'html.parser')
                # Look for artist links in search results
                artist_links = soup.find_all('a', href=re.compile(r'/artist/', re.I))
                for link in artist_links[:10]:  # Check more results
                    href = link.get('href', '')
                    # Check if this link contains our UUID
                    if setlistfm_id.lower().replace('-', '') in href.lower().replace('-', ''):
                        artist_url = f"https://www.setlist.fm{href}" if not href.startswith('http') else href
                        # Visit artist page
                        artist_r = requests.get(artist_url, headers=headers, timeout=10)
                        if artist_r.status_code == 200:
                            artist_soup = BeautifulSoup(artist_r.content, 'html.parser')
                            # Look for genre/tag information on Setlist.fm artist pages
                            # Setlist.fm doesn't typically show genres directly, but we can try tags
                            tags = artist_soup.find_all(['a', 'span'], class_=re.compile(r'tag|genre|label', re.I))
                            genres = []
                            for tag in tags:
                                tag_text = tag.get_text(strip=True)
                                if tag_text and len(tag_text) < 30 and tag_text.lower() not in ['tag', 'tags', 'genre', 'genres']:
                                    genres.append(tag_text)
                            if genres:
                                return list(set(genres[:5])), "Setlist.fm (ID)"
    except Exception as e:
        pass
    return None, None

def get_dice_genres_by_id(dice_id: str, artist_name: str = None) -> Tuple[Optional[List[str]], str]:
    """Get genres from Dice.fm using artist ID."""
    # Dice.fm doesn't typically have genre info, but we can try to scrape artist page
    # Dice uses numeric IDs for events/artists
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml"
    }
    try:
        if artist_name:
            # Search for artist on Dice
            search_url = f"https://dice.fm/search?q={requests.utils.quote(artist_name)}"
            r = requests.get(search_url, headers=headers, timeout=10)
            if r.status_code == 200:
                soup = BeautifulSoup(r.content, 'html.parser')
                # Look for artist/event links - Dice may show event pages with artist info
                # Note: Dice is primarily a ticketing platform, so genre data is usually not available
                links = soup.find_all('a', href=re.compile(r'/artist/|/event/', re.I))
                for link in links[:10]:  # Check more results
                    link_text = link.get_text(strip=True).lower()
                    # Try to match artist name in link text
                    if artist_name.lower() in link_text or link_text in artist_name.lower():
                        href = link.get('href', '')
                        if href:
                            artist_url = f"https://dice.fm{href}" if not href.startswith('http') else href
                            artist_r = requests.get(artist_url, headers=headers, timeout=10)
                            if artist_r.status_code == 200:
                                artist_soup = BeautifulSoup(artist_r.content, 'html.parser')
                                # Try to find genre tags or category information
                                # Dice typically doesn't show genres, but we can try
                                tags = artist_soup.find_all(['span', 'div', 'a', 'p'], 
                                                           class_=re.compile(r'tag|genre|category|style', re.I))
                                genres = []
                                for tag in tags:
                                    tag_text = tag.get_text(strip=True)
                                    if tag_text and len(tag_text) < 30:
                                        tag_lower = tag_text.lower()
                                        if tag_lower not in ['genre', 'genres', 'tag', 'tags', 'category', 'categories', 'style']:
                                            genres.append(tag_text)
                                if genres:
                                    return list(set(genres[:5])), "Dice (ID)"
    except Exception as e:
        pass
    return None, None

def scrape_web_search(artist_name: str) -> Tuple[Optional[List[str]], str]:
    """Use web search to find genre information (fallback method)."""
    # Try AllMusic first
    genres, source = scrape_allmusic(artist_name)
    if genres:
        return genres, source
    
    # Try Wikipedia
    genres, source = scrape_wikipedia(artist_name)
    if genres:
        return genres, source
    
    return None, None

def extract_external_ids(external_identifiers_str: str) -> dict:
    """Extract external IDs from JSON string."""
    if not external_identifiers_str or external_identifiers_str.strip() == '[]':
        return {}
    
    try:
        ids_list = json.loads(external_identifiers_str)
        result = {}
        for item in ids_list:
            source = item.get("source", "").lower()
            identifiers = item.get("identifier", [])
            if identifiers and len(identifiers) > 0:
                result[source] = identifiers[0]  # Take first identifier
        return result
    except:
        return {}

def filter_childrens_music(genres: List[str]) -> List[str]:
    """Filter out children's music related genres and non-genre tags."""
    if not genres:
        return []
    
    # Filter out children's music related terms
    exclude_terms = [
        "children's music", "childrens music", "childrens", "kids", 
        "lullaby", "kids music", "children music", "children"
    ]
    
    # Also filter out non-genre tags
    non_genre_tags = [
        "seen live", "favorites", "my library", "under 2000 listeners",
        "seen-live", "favorite", "library", "all", "music", "spotify",
        "usa", "american", "united states", "british", "german", "italian",
        "french", "european", "columbus", "birmingham", "new orleans",
        "peruvian", "quechua", "switzerland", "fixme or cleanup", "unknown",
        "special purpose artist", "special purpose", "compilation", "soundtrack",
        "cast", "2008 universal fire victim", "oh yeah", "classy", "ELEGANCE IS LEARN",
        "ekwal", "leon larregui", "zoé", "raf", "80s", "italy", "kinderlieder",
        "female vocalists", "female composer", "german composer", "composer",
        "2 tone", "2 times", "times", "seen live"
    ]
    
    # Filter out generic AllMusic fallback genres (when all 5 are present together)
    allmusic_fallback = {"blues", "classical", "country", "electronic", "folk"}
    if len(genres) == 5 and set(g.lower() for g in genres) == allmusic_fallback:
        return []  # This is the generic AllMusic fallback, not real genres
    
    filtered = []
    for genre in genres:
        genre_lower = genre.lower().strip()
        # Check if genre contains any excluded terms
        if any(term in genre_lower for term in exclude_terms):
            continue
        # Check if genre contains any non-genre tag (substring match)
        if any(non_tag.lower() in genre_lower for non_tag in non_genre_tags):
            continue
        # Check if it's too short (likely not a genre)
        if len(genre_lower) < 3:
            continue
        filtered.append(genre)
    
    return filtered

def find_genres(artist_name: str, external_ids: dict, spotify_token: Optional[str]) -> Tuple[List[str], str]:
    # Try Spotify by ID first (most accurate)
    if spotify_token and "spotify" in external_ids:
        genres, source = get_spotify_genres_by_id(external_ids["spotify"], spotify_token)
        if genres:
            filtered = filter_childrens_music(genres)
            if filtered:  # Only return if we have non-children's music genres
                return filtered, f"Spotify (ID)"
    
    # Try MusicBrainz by ID
    if "musicbrainz" in external_ids:
        genres, source = get_musicbrainz_genres_by_id(external_ids["musicbrainz"])
        if genres:
            filtered = filter_childrens_music(genres)
            if filtered:
                return filtered, f"MusicBrainz (ID)"
    
    # Try Setlist.fm by ID
    if "setlistfm" in external_ids:
        genres, source = get_setlistfm_genres_by_id(external_ids["setlistfm"], artist_name)
        if genres:
            filtered = filter_childrens_music(genres)
            if filtered:
                return filtered, f"Setlist.fm (ID)"
    
    # Try Dice by ID (though it may not have genres)
    if "dice" in external_ids:
        genres, source = get_dice_genres_by_id(external_ids["dice"], artist_name)
        if genres:
            filtered = filter_childrens_music(genres)
            if filtered:
                return filtered, f"Dice (ID)"
    
    # Fallback to name search: Try Spotify
    if spotify_token:
        genres, source = search_spotify(artist_name, spotify_token)
        if genres:
            filtered = filter_childrens_music(genres)
            if filtered:
                return filtered, "Spotify"
    
    # Try Last.fm
    genres, source = search_lastfm(artist_name)
    if genres:
        filtered = filter_childrens_music(genres)
        if filtered:
            return filtered, "Last.fm"
    
    # Try MusicBrainz
    genres, source = search_musicbrainz(artist_name)
    if genres:
        filtered = filter_childrens_music(genres)
        if filtered:
            return filtered, "MusicBrainz"
    
    # Last resort: Web scraping
    genres, source = scrape_web_search(artist_name)
    if genres:
        filtered = filter_childrens_music(genres)
        if filtered:
            return filtered, source
    
    return [], "None"

# Parse command-line arguments
parser = argparse.ArgumentParser(description='Process artists CSV file to find missing genres')
parser.add_argument('input_file', help='Path to the CSV file with artists data')
parser.add_argument('--output-dir', '-o', default='~', 
                    help='Directory to save output files (default: home directory)')
args = parser.parse_args()

# Get input file path
input_file = os.path.expanduser(args.input_file)
if not os.path.exists(input_file):
    print(f"Error: Input file not found: {input_file}")
    exit(1)

# Generate output file names based on input file name
input_basename = os.path.splitext(os.path.basename(input_file))[0]
# Clean up the filename for use in output files
output_suffix = re.sub(r'[^\w\s-]', '', input_basename).strip().replace(' ', '_')
output_dir = os.path.expanduser(args.output_dir)
sql_file = os.path.join(output_dir, f"{output_suffix}_updates.sql")
markdown_file = os.path.join(output_dir, f"{output_suffix}_report.md")

print("="*70)
print("Processing Artists Without Genres CSV")
print("="*70)
print(f"Input file: {input_file}")
print(f"Output SQL: {sql_file}")
print(f"Output report: {markdown_file}")
print()

# Read all rows
all_rows = []
with open(input_file, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Only process rows with empty genres
        if row.get('genres', '').strip() == '[]':
            all_rows.append(row)

print(f"Found {len(all_rows)} artists with empty genres")

if len(all_rows) == 0:
    print("No artists to process!")
    exit(0)

estimated_time = len(all_rows) * 0.3 / 60
print(f"Estimated time: ~{estimated_time:.1f} minutes\n")

# Get Spotify token
spotify_token = get_spotify_token()
if spotify_token:
    print("✓ Spotify API: Connected")
else:
    print("⚠ Spotify API: Not connected")
print("✓ Last.fm API: Ready")
print("✓ MusicBrainz: Ready")
print("✓ Setlist.fm: Ready (ID lookup)")
print("✓ Dice: Ready (ID lookup)")
print("✓ Web Scraping: Ready (AllMusic, Wikipedia)")
print("="*70)
print()

# Process all artists
results = []
stats = {"spotify": 0, "spotify (id)": 0, "lastfm": 0, "musicbrainz": 0, "musicbrainz (id)": 0, "setlistfm (id)": 0, "dice (id)": 0, "allmusic": 0, "wikipedia": 0, "not_found": 0}
processed_row_numbers = []

# Read original CSV to find row numbers
with open(input_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    csv_rows = {}
    for i, line in enumerate(lines[1:], start=2):  # Start at row 2 (after header)
        parts = line.strip().split(',')
        if len(parts) >= 2:
            csv_rows[parts[1]] = i  # artist name -> row number

for i, row in enumerate(all_rows, 1):
    artist_name = row['name']
    artist_id = row['id']
    external_ids_str = row.get('external_identifiers', '[]')
    external_ids = extract_external_ids(external_ids_str)
    
    # Find original row number
    original_row_num = csv_rows.get(artist_name, None)
    
    # Show progress every 10 artists or first/last
    show_output = (i % 10 == 0 or i == 1 or i == len(all_rows))
    if show_output:
        print(f"[{i}/{len(all_rows)}] {artist_name}...", end=" ")
    
    genres, source = find_genres(artist_name, external_ids, spotify_token)
    
    if genres:
        genres_json = json.dumps(genres)
        if show_output:
            print(f"✓ [{source}] {', '.join(genres[:2])}{'...' if len(genres) > 2 else ''}")
        results.append({
            "id": artist_id,
            "name": artist_name,
            "genres": genres_json,
            "source": source,
            "row_number": original_row_num
        })
        # Normalize source name for stats
        if source == "Spotify (ID)":
            stats["spotify (id)"] += 1
        elif source == "Spotify":
            stats["spotify"] += 1
        elif source == "MusicBrainz (ID)":
            stats["musicbrainz (id)"] += 1
        elif source == "MusicBrainz":
            stats["musicbrainz"] += 1
        elif source == "Setlist.fm (ID)":
            stats["setlistfm (id)"] += 1
        elif source == "Dice (ID)":
            stats["dice (id)"] += 1
        elif source == "Last.fm":
            stats["lastfm"] += 1
        elif source == "AllMusic":
            stats["allmusic"] += 1
        elif source == "Wikipedia":
            stats["wikipedia"] += 1
        else:
            # Fallback for any other sources
            stats[source.lower()] = stats.get(source.lower(), 0) + 1
        if original_row_num:
            processed_row_numbers.append(original_row_num)
    else:
        if show_output:
            print("✗ Not found")
        results.append({
            "id": artist_id,
            "name": artist_name,
            "genres": '["small artist"]',
            "source": "None",
            "row_number": original_row_num
        })
        stats["not_found"] += 1
        if original_row_num:
            processed_row_numbers.append(original_row_num)
    
    # Rate limiting
    if "spotify" in source.lower():
        time.sleep(0.2)
    elif source == "Last.fm":
        time.sleep(0.3)
    elif "musicbrainz" in source.lower():
        time.sleep(1.1)
    elif source in ["AllMusic", "Wikipedia"]:
        time.sleep(1.0)  # Be respectful to web servers
    else:
        time.sleep(0.1)

# Sort processed row numbers
processed_row_numbers.sort()

# Generate SQL
sql_output = []
sql_output.append("-- SQL UPDATE statements for Artists Without Genres")
sql_output.append(f"-- Generated automatically - {len(results)} artists")
sql_output.append("")
sql_output.append("BEGIN;")
sql_output.append("")

for result in results:
    artist_id = result['id']
    genres_json = result['genres']
    genres_sql = genres_json.replace("'", "''")
    sql_output.append(f"UPDATE artists SET genres = '{genres_sql}'::jsonb WHERE id = '{artist_id}';")

sql_output.append("")
sql_output.append("COMMIT;")

# Save SQL to file
with open(sql_file, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_output))

# Generate Markdown report
markdown_output = []
markdown_output.append("# Processing Report: Count Artists by Genre")
markdown_output.append("")
markdown_output.append(f"**Total Artists Processed:** {len(results)}")
markdown_output.append(f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}")
markdown_output.append("")
markdown_output.append("## Statistics")
markdown_output.append("")
markdown_output.append(f"- ✓ Found via Spotify (ID): {stats.get('spotify (id)', 0)}")
markdown_output.append(f"- ✓ Found via Spotify (search): {stats.get('spotify', 0)}")
markdown_output.append(f"- ✓ Found via MusicBrainz (ID): {stats.get('musicbrainz (id)', 0)}")
markdown_output.append(f"- ✓ Found via MusicBrainz (search): {stats.get('musicbrainz', 0)}")
markdown_output.append(f"- ✓ Found via Setlist.fm (ID): {stats.get('setlistfm (id)', 0)}")
markdown_output.append(f"- ✓ Found via Dice (ID): {stats.get('dice (id)', 0)}")
markdown_output.append(f"- ✓ Found via Last.fm: {stats.get('lastfm', 0)}")
markdown_output.append(f"- ✓ Found via AllMusic (web): {stats.get('allmusic', 0)}")
markdown_output.append(f"- ✓ Found via Wikipedia (web): {stats.get('wikipedia', 0)}")
markdown_output.append(f"- ✗ Not found: {stats.get('not_found', 0)}")
markdown_output.append("")
markdown_output.append("## Processed CSV Row Numbers")
markdown_output.append("")
markdown_output.append(f"The following **{len(processed_row_numbers)} rows** from the CSV were processed:")
markdown_output.append("")
# Split into chunks for readability
chunk_size = 50
for idx in range(0, len(processed_row_numbers), chunk_size):
    chunk = processed_row_numbers[idx:idx+chunk_size]
    markdown_output.append("```")
    markdown_output.append(", ".join(map(str, chunk)))
    markdown_output.append("```")
    markdown_output.append("")
markdown_output.append("## SQL File")
markdown_output.append("")
markdown_output.append(f"SQL UPDATE statements have been saved to: `{sql_file}`")
markdown_output.append("")
markdown_output.append("Copy and paste the SQL statements into your Supabase SQL editor to update the database.")

# Save Markdown report
with open(markdown_file, 'w', encoding='utf-8') as f:
    f.write('\n'.join(markdown_output))

# Print summary
print()
print("="*70)
print("SUMMARY:")
print("="*70)
print(f"  Total processed: {len(results)}")
print(f"  ✓ Found via Spotify (ID): {stats.get('spotify (id)', 0)}")
print(f"  ✓ Found via Spotify (search): {stats.get('spotify', 0)}")
print(f"  ✓ Found via MusicBrainz (ID): {stats.get('musicbrainz (id)', 0)}")
print(f"  ✓ Found via MusicBrainz (search): {stats.get('musicbrainz', 0)}")
print(f"  ✓ Found via Setlist.fm (ID): {stats.get('setlistfm (id)', 0)}")
print(f"  ✓ Found via Dice (ID): {stats.get('dice (id)', 0)}")
print(f"  ✓ Found via Last.fm: {stats.get('lastfm', 0)}")
print(f"  ✓ Found via AllMusic (web): {stats.get('allmusic', 0)}")
print(f"  ✓ Found via Wikipedia (web): {stats.get('wikipedia', 0)}")
print(f"  ✗ Not found: {stats.get('not_found', 0)}")
print("="*70)
print()
print(f"✓ SQL file saved to: {sql_file}")
print(f"✓ Markdown report saved to: {markdown_file}")
print()
print(f"📍 Processed CSV rows: {len(processed_row_numbers)} rows")

