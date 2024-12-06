'use client';

import Link from 'next/link';
import BlueprintCard from '@/app/components/BlueprintCard';
import { Blueprint, Status } from '@zk-email/sdk';
import sdk from '@/lib/sdk';
import { useState, useEffect, useRef, useCallback } from 'react';
import Loader from '@/components/ui/loader';
import { useAuthStore } from '@/lib/stores/useAuthStore';
import { toast } from 'react-toastify';

const PAGINATION_LIMIT = 150;

interface BlueprintListProps {
  search: string | null;
  filters: Status[];
  sort: string;
}

export default function BlueprintList({ search, filters, sort }: BlueprintListProps) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [userStarredSlugs, setUserStarredSlugs] = useState<string[]>([]);
  const token = useAuthStore((state) => state.token);
  const [skip, setSkip] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const observerRef = useRef<IntersectionObserver>();
  const loadingRef = useRef<HTMLDivElement>(null);
  const githubUserName = useAuthStore.getState().username;

  const fetchBlueprints = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    try {
      const results = await sdk.listBlueprints({
        search: search || '',
        skip,
        limit: PAGINATION_LIMIT,
        status: filters.length > 0 ? filters : undefined,
        // sort: sort === 'most-recent' ? 1 : -1,
      });

      setBlueprints([
        ...results.filter((bp) => bp.props.githubUsername === githubUserName),
        ...results
          .filter((bp) => bp.props.githubUsername !== githubUserName)
          .filter((bp) => bp.props.status === Status.Done)
          .sort((a, b) => b.stars - a.stars),
      ]);

      // TODO: commenting this out for now. Uncomment this when we have proper sorting and filtering logic in the SDK
      // setBlueprints((prev) => {
      //   // If search changes, replace results instead of appending
      //   if (skip === 0)
      //     return results.filter(
      //       (bp) => bp.props.githubUsername === githubUserName || bp.props.status === Status.Done
      //     );
      //   return [
      //     ...prev,
      //     ...results.filter(
      //       (bp) => bp.props.githubUsername === githubUserName || bp.props.status === Status.Done
      //     ),
      //   ];
      // });

      // If we got fewer results than the limit, we've reached the end
      setHasMore(results.length === PAGINATION_LIMIT);
      setSkip((prevSkip) => prevSkip + PAGINATION_LIMIT);
    } catch (err) {
      // In React 19, errors are not re-thrown, so we handle them explicitly
      setError(err instanceof Error ? err : new Error('Failed to fetch blueprints'));
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [search, filters, sort, skip, isLoading, hasMore]);

  // Reset state when search changes
  useEffect(() => {
    setBlueprints([]);
    setSkip(0);
    setHasMore(true);
    setError(null);
  }, [search, filters, sort]);

  // Initialize intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchBlueprints();
        }
      },
      { threshold: 0.1 }
    );

    observerRef.current = observer;
    return () => observer.disconnect();
  }, [fetchBlueprints]);

  // Observe loading div
  useEffect(() => {
    const currentObserver = observerRef.current;
    const currentLoadingRef = loadingRef.current;

    if (currentLoadingRef && currentObserver) {
      currentObserver.observe(currentLoadingRef);
    }

    return () => {
      if (currentLoadingRef && currentObserver) {
        currentObserver.unobserve(currentLoadingRef);
      }
    };
  }, [blueprints]);

  useEffect(() => {
    if (token) {
      sdk
        .getStarredBlueprints()
        .then(setUserStarredSlugs)
        .catch((err) => {
          console.error('Failed to get starred blueprints: ', err);
        });
    } else {
      setUserStarredSlugs([]);
    }
  }, [token]);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-red-600">
        Error loading blueprints: {error.message}
      </div>
    );
  }

  const onStar = async (blueprint: Blueprint) => {
    if (!token) {
      toast.info('Login to star a blueprint');
      return;
    }
    try {
      await blueprint.addStar();
      const slugs = await sdk.getStarredBlueprints();
      setUserStarredSlugs(slugs);
    } catch (err) {
      console.warn('Failed to star blueprint: ', err);
    }
  };

  const onUnStar = async (blueprint: Blueprint) => {
    if (!token) {
      toast.info('Login to star a blueprint');
      return;
    }
    try {
      await blueprint.removeStar();
      const slugs = await sdk.getStarredBlueprints();
      setUserStarredSlugs(slugs);
    } catch (err) {
      console.warn('Failed to unstar blueprint: ', err);
    }
  };

  return (
    <>
      {blueprints.map((blueprint) => (
        <div className="mb-3" key={blueprint.props.id}>
          <Link
            href={
              blueprint.props.status === Status.Draft
                ? `/${encodeURIComponent(blueprint.props.id!)}/versions`
                : `/${encodeURIComponent(blueprint.props.id!)}`
            }
          >
            <BlueprintCard
              blueprint={blueprint}
              setStarred={() => onStar(blueprint)}
              setUnStarred={() => onUnStar(blueprint)}
              starred={userStarredSlugs && userStarredSlugs.includes(blueprint.props.slug!)}
            />
          </Link>
        </div>
      ))}

      <div ref={loadingRef} className="flex h-10 w-full items-center justify-center">
        {isLoading ? (
          <Loader />
        ) : !hasMore && blueprints.length > 0 ? (
          <div className="text-grey-500">No more blueprints to load</div>
        ) : blueprints.length === 0 && !isLoading ? (
          search ? (
            <div>No blueprints found for "{search}"</div>
          ) : (
            <div>No blueprints found</div>
          )
        ) : null}
      </div>
    </>
  );
}
