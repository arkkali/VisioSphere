import { useState } from 'react';

export const useCCTV = () => {
  const [cctvFeeds, setCCTVFeeds] = useState([
    { id: 1, name: 'Room 101', url: null, status: 'offline' },
    { id: 2, name: 'Room 202', url: null, status: 'offline' },
    { id: 3, name: 'Main Hallway', url: null, status: 'offline' }
  ]);

  const [activeFeed, setActiveFeed] = useState(null);
  const [error, setError] = useState(null);

  const addCCTVFeed = (feed) => {
    const newFeed = {
      id: Date.now(),
      name: feed.name,
      url: feed.url,
      status: 'connecting'
    };
    setCCTVFeeds([...cctvFeeds, newFeed]);
    return newFeed.id;
  };

  const updateCCTVFeed = (feedId, updates) => {
    setCCTVFeeds(cctvFeeds.map(feed =>
      feed.id === feedId ? { ...feed, ...updates } : feed
    ));
  };

  const removeCCTVFeed = (feedId) => {
    setCCTVFeeds(cctvFeeds.filter(feed => feed.id !== feedId));
    if (activeFeed === feedId) {
      setActiveFeed(null);
    }
  };

  const testCCTVConnection = async (url) => {
    try {
      setError(null);
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (err) {
      setError(`CCTV connection failed: ${err.message}`);
      return false;
    }
  };

  return {
    cctvFeeds,
    activeFeed,
    setActiveFeed,
    addCCTVFeed,
    updateCCTVFeed,
    removeCCTVFeed,
    testCCTVConnection,
    error
  };
};